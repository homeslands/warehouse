import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import {
  canCreateImportForm,
  importFormAbilities,
  useAllAvailableMaterials,
  useAvailableMaterials,
  useImportForm,
  useSuppliers,
  type AvailableMaterial,
  type ImportFormAccess,
} from '@/entities/import-form'
import { assignMaterialToWarehouse, inventoryKeys, type InventoryItem } from '@/entities/inventory'
import { fetchMaterialsPage, materialAbilities, materialKeys } from '@/entities/material'
import { can, getSessionEpoch, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { invalidateAfterMaterialWrite } from '@/features/material-form'
import {
  formSupplierSlug,
  toAvailableMaterial,
  MAX_ITEMS,
  supplierNameLookup,
  useReceiveDraft,
  addImportLines,
  baseUnitOf,
} from '@/features/receive-checklist'
import {
  canAssignWarehouse,
  canCreateInWarehouse,
  classifyAssignError,
} from '@/features/warehouse-assign'
import { errorMessage } from '@/shared/api/error-message'
import { formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { BUSINESS_CODE_REGEX } from '@/shared/lib/code'
import { haptics } from '@/shared/lib/haptics'
import { useLineFocus } from '@/shared/lib/line-focus'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTheme } from '@/shared/theme/useTheme'
import {
  Button,
  ComposeSectionHeader,
  MaterialPickList,
  PickSelectAllBar,
  SearchField,
  SheetScaffold,
  Text,
  type PickItem,
  ErrorBox,
} from '@/shared/ui'

import { catalogToAvailable, notInWarehouse, splitBySupplier } from './pick-groups'

type Picked = { m: AvailableMaterial; cat: boolean }

/** Vẽ dần (cửa sổ chung cho cả hai nhóm): số thẻ hiện ban đầu và thêm mỗi lần cuộn tới cuối. */
const WINDOW_PAGE = 50
/** Nhóm "Chưa có trong kho" chỉ tìm khi từ khoá có ít nhất ngần này ký tự (sau trim). */
const CATALOG_MIN_CHARS = 2

/**
 * Route `/import-pick` — bộ chọn NHIỀU vật tư cho phiếu nhập đang soạn. Tải HẾT vật tư của kho một lần
 * (`available-materials`, mọi trang), lọc tên / mã không dấu ở máy. Kho quá lớn (chạm trần 50 trang —
 * `truncated`): câu báo "Kho có quá nhiều vật tư — gõ để tìm." trên danh sách, gõ từ khoá thì kết quả lấy từ
 * tìm trên server (`useAvailableMaterials`, trang đầu) rồi chia nhóm như thường. "Bên bán của phiếu" =
 * `formSupplierSlug` (phiếu mới: bên bán bước 1; phiếu đã có: chỉ khi có `SUPPLIER_READ` và mọi dòng server cùng một
 * bên bán). Có → hai nhóm "Của <NCC>" (vật tư NCC đã bán; 0 vật tư thì chỉ câu `mineEmpty`, không tiêu đề) và
 * "Vật tư khác" (chọn → backend gắn vào NCC khi lưu phiếu, có câu báo dưới nút đáy); không có → một danh sách,
 * không gợi ý. Cả hai nhóm vẽ dần theo MỘT cửa sổ (50 thẻ đầu tính từ nhóm 1 sang nhóm 2, +50 mỗi lần cuộn tới
 * cuối, đổi từ khoá thì về 50). Ô tìm + "Chọn tất cả" ghim trên vùng cuộn. Mỗi thẻ: ô tick, tên, mã, "Bên
 * bán: …" (tối đa 2 tên + "+n"), "Tồn n <đơn vị gốc>". Đã có trên phiếu ghi "đã có", chưa khai đơn vị ghi
 * "Chưa có đơn vị" — đều không tick được. Tick giữ qua lần đổi từ khoá. Sức chứa = 200 − số dòng. Nút đáy
 * "Thêm n vật tư" → `addImportLines` (theo thứ tự tick), đóng sheet, bước 2 tự mở sheet sửa của dòng đầu. Tự
 * đóng khi không còn bản nháp hoặc người dùng không soạn được phiếu (phiếu mới: `canCreateImportForm`; phiếu
 * đã có: `importFormAbilities(...).canAddLine`).
 *
 * Nhóm cuối "Chưa có trong kho" (cần `canAssignWarehouse` + `MATERIAL_READ`, từ khoá ≥ 2 ký tự): trang 1 danh mục
 * theo từ khoá, bỏ vật tư đã ở kho. Tick + "Thêm" → xác nhận → PUT gắn kho từng vật tư → thêm dòng chung với vật
 * tư khả dụng đã tick; vật tư lỗi giữ tick + hộp lỗi, sheet giữ mở.
 */
export function ImportPickMaterialsSheetScreen() {
  const { t, i18n } = useTranslation(['importForms', 'common', 'catalog', 'errors'])
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const { colors } = useTheme()
  const close = useCloseSheet()
  const router = useRouter()
  const queryClient = useQueryClient()

  const draft = useReceiveDraft((s) => s.draft)
  const formSlug = useReceiveDraft((s) => s.ctx?.formSlug)
  const saving = useReceiveDraft((s) => s.saving)
  const user = useAuthStore((s) => s.user)
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const warehouse = useWarehouseStore((s) => s.current)
  const isNew = formSlug === 'new'
  const formQuery = useImportForm(warehouseSlug, formSlug && !isNew ? formSlug : undefined)
  // Tên bên bán của phiếu (bản nháp chỉ giữ slug) lấy từ danh sách bên bán (cache), như nút "Bên bán".
  const suppliers = useSuppliers(!!user && can(user, 'SUPPLIER_READ'))
  const access = useMemo<ImportFormAccess | null>(
    () => (user ? { can: (c) => can(user, c), userSlug: user.userSlug ?? null } : null),
    [user],
  )
  // Tìm vật tư (`available-materials`) cần IMPORT_FORM_CREATE ở backend: phiếu mới cần quyền tạo; phiếu đã
  // có cần quyền sửa phiếu VÀ quyền tạo (`canAddLine`).
  const denied =
    !!access &&
    (isNew
      ? !canCreateImportForm(access)
      : !!formQuery.data && !importFormAbilities(access, formQuery.data).canAddLine)

  // Không còn bản nháp (phiên đổi, mở thẳng) hoặc không được thêm dòng → không có gì để làm.
  const gone = !draft || denied
  useEffect(() => {
    if (gone) close()
    // `close` đổi định danh mỗi lần render; chỉ phản ứng khi điều kiện đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone])

  const [text, setText] = useState('')
  const term = useDebounced(text).trim()
  const search = useAllAvailableMaterials(warehouseSlug)
  const all = search.data?.items
  const truncated = search.data?.truncated === true
  // Kho quá lớn + có từ khoá: tìm trên server (danh sách đã tải chỉ là phần đầu).
  const remote = truncated && term !== ''
  const found = useAvailableMaterials(warehouseSlug, term, remote)
  const source = remote ? found.data?.items : all
  // Số thẻ đang vẽ (cả hai nhóm); đổi từ khoá thì về 50 (gắn theo từ khoá, không cần effect).
  const [more, setMore] = useState({ term: '', shown: WINDOW_PAGE })
  const windowSize = more.term === term ? more.shown : WINDOW_PAGE
  // Vật tư đã tick (theo thứ tự tick), giữ cả bản `AvailableMaterial` để không mất khi kết quả tìm đổi.
  // `cat` = tick thuộc nhóm "Chưa có trong kho" (cần gắn vào kho trước khi thêm dòng).
  const [picked, setPicked] = useState<ReadonlyMap<string, Picked>>(new Map())
  const [failLines, setFailLines] = useState<string[] | null>(null)
  const confirming = useRef(false)

  // Nhóm "Chưa có trong kho": cần quyền gắn kho + đọc danh mục, từ khoá ≥ 2 ký tự; trang 1 của danh mục.
  const catalogOn =
    !!warehouseSlug &&
    canAssignWarehouse(user) &&
    materialAbilities(user).read &&
    term.length >= CATALOG_MIN_CHARS
  // Lọc theo kho (bỏ vật tư đã ở kho) làm lúc render nên khoá không cần chứa kho.
  const catalog = useQuery({
    queryKey: [...materialKeys.all, 'pick-not-in-warehouse', term],
    queryFn: () => fetchMaterialsPage({ query: term, page: 1 }),
    enabled: catalogOn,
    staleTime: 30_000,
  })

  const lines = draft?.lines
  const onForm = useMemo(() => new Set((lines ?? []).map((l) => l.materialSlug)), [lines])
  const capacity = Math.max(0, MAX_ITEMS - (lines?.length ?? 0))
  // Tick còn hiệu lực: vật tư đã tick mà vừa thành "đã có" (vd quét thêm) không tính.
  const validCount = useMemo(
    () => [...picked.keys()].filter((slug) => !onForm.has(slug)).length,
    [picked, onForm],
  )
  const checked = useMemo<ReadonlySet<string>>(() => new Set(picked.keys()), [picked])
  const assignCount = [...picked.values()].filter((p) => p.cat && !onForm.has(p.m.slug)).length

  const toggle = (m: AvailableMaterial, cat = false) => {
    setFailLines(null)
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(m.slug)) next.delete(m.slug)
      else if ([...next.keys()].filter((slug) => !onForm.has(slug)).length < capacity)
        next.set(m.slug, { m, cat })
      else return prev
      return next
    })
    haptics.selection()
  }

  const onToggle = (slug: string) => {
    const p = picked.get(slug)
    if (p) return toggle(p.m, p.cat)
    const m = byId.get(slug)
    if (m) return toggle(m)
    const c = catById.get(slug)
    if (c) toggle(c, true)
  }

  const selectMany = (ids: string[], select: boolean) => {
    setPicked((prev) => {
      const next = new Map(prev)
      if (!select) {
        for (const id of ids) next.delete(id)
        return next
      }
      for (const id of ids) {
        const m = byId.get(id)
        if (!m || next.has(id)) continue
        if ([...next.keys()].filter((slug) => !onForm.has(slug)).length >= capacity) break
        next.set(id, { m, cat: false })
      }
      return next
    })
  }

  const addAndClose = (todo: AvailableMaterial[]): boolean => {
    const current = useReceiveDraft.getState()
    const keys = addImportLines(todo, {
      supplierName: (slug) => suppliers.data?.find((s) => s.slug === slug)?.name ?? null,
      user,
    })
    if (keys.length === 0) {
      haptics.error()
      return false
    }
    const slug = current.ctx?.formSlug
    if (slug) useLineFocus.getState().ask('import', slug, keys[0])
    haptics.success()
    close()
    return true
  }

  /** Gắn các vật tư nhóm "Chưa có trong kho" vào kho (PUT lần lượt), rồi thêm dòng cùng các vật tư khả dụng đã tick. */
  const assignAndAdd = async (todo: Picked[]) => {
    const start = useReceiveDraft.getState()
    const formKey = start.ctx?.formSlug
    const wh = start.ctx?.warehouseSlug
    if (!wh || !formKey) return
    const draftOk = () => {
      const { ctx, draft: d, saving: s } = useReceiveDraft.getState()
      return !!d && !s && ctx?.formSlug === formKey && ctx.warehouseSlug === wh
    }
    // Kiểm sức chứa + bản nháp TRƯỚC khi gắn kho: gắn xong mà không thêm được dòng thì vật tư đã đổi kho oan.
    const room = MAX_ITEMS - (useReceiveDraft.getState().draft?.lines.length ?? MAX_ITEMS)
    if (!draftOk() || room < todo.length) {
      haptics.error()
      setFailLines([t('catalog:material.importUnavailable')])
      return
    }
    const epoch = getSessionEpoch()
    const stale = () => getSessionEpoch() !== epoch
    const assigned = new Map<string, InventoryItem>()
    const failed: { m: AvailableMaterial; error: unknown }[] = []
    for (const p of todo) {
      if (!p.cat) continue
      if (stale()) return
      try {
        const item = await assignMaterialToWarehouse(wh, { materialSlug: p.m.slug })
        if (stale()) return
        assigned.set(p.m.slug, item)
      } catch (error) {
        if (stale()) return
        failed.push({ m: p.m, error })
      }
    }
    // Bản nháp đổi trong lúc gắn (phiếu / kho / đang lưu / đủ dòng): không thêm dòng; vật tư đã ở trong kho.
    const lines: AvailableMaterial[] = []
    for (const p of todo) {
      const item = assigned.get(p.m.slug)
      if (!p.cat) lines.push(p.m)
      // NCC của vật tư = của danh mục (PUT gắn kho KHÔNG gắn bên bán); `addImportLines` ghim bên bán phiếu.
      else if (item) lines.push({ ...toAvailableMaterial(item), suppliers: p.m.suppliers })
    }
    const keys = draftOk()
      ? addImportLines(lines, {
          supplierName: (slug) => suppliers.data?.find((x) => x.slug === slug)?.name ?? null,
          user,
        })
      : []
    // Bỏ tick vật tư đã thêm dòng; vật tư đã gắn kho mà chưa thêm dòng: giữ tick, thành vật tư thường
    // (đã ở kho — bấm lại chỉ thêm dòng, không PUT lần nữa); vật tư lỗi: giữ tick nhóm này.
    // `addImportLines` bỏ vật tư không có đơn vị / hết chỗ: tính theo dòng thực sự có trên bản nháp.
    const onDraft = new Set(
      (useReceiveDraft.getState().draft?.lines ?? []).map((l) => l.materialSlug),
    )
    const added = new Set(
      keys.length > 0 ? lines.map((m) => m.slug).filter((x) => onDraft.has(x)) : [],
    )
    setPicked(
      (prev) =>
        new Map(
          [...prev]
            .filter(([slug]) => !added.has(slug))
            .map(([slug, p]) => [slug, assigned.has(slug) ? { ...p, cat: false } : p]),
        ),
    )
    const notAdded = [...assigned.keys()].filter((slug) => !added.has(slug)).length
    // Làm mới cache không chặn kết quả, lỗi làm mới không ghi đè hộp lỗi.
    if (assigned.size > 0) {
      void Promise.all([
        ...[...assigned.keys()].map((slug) => invalidateAfterMaterialWrite(queryClient, slug)),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) }),
      ]).catch(() => {})
    }
    if (failed.length > 0 || notAdded > 0) {
      haptics.error()
      const out: string[] = []
      if (failed.length > 0)
        out.push(t('catalog:warehouseAssign.partialFailed', { count: failed.length }))
      out.push(
        ...failed.map((f) => {
          const kind = classifyAssignError(f.error)
          const reason =
            kind === 'reassign'
              ? t('catalog:warehouseAssign.reasonReassign')
              : kind === 'notFound'
                ? t('catalog:warehouseAssign.reasonNotFound')
                : errorMessage(f.error, t)
          return `${f.m.code}: ${reason}`
        }),
      )
      if (notAdded > 0) out.push(t('importForms:pick.assignedNotAdded', { count: notAdded }))
      if (failed.some((f) => classifyAssignError(f.error) === 'reassign'))
        out.push(t('catalog:warehouseAssign.reassignHint'))
      setFailLines(out)
      return
    }
    useLineFocus.getState().ask('import', formKey, keys[0])
    haptics.success()
    close()
  }

  const guarded = useGuardedAction(assignAndAdd, {
    onError: (e) => {
      haptics.error()
      setFailLines([errorMessage(e, t)])
    },
  })
  const busy = guarded.pending

  const confirm = async () => {
    if (confirming.current || busy || useReceiveDraft.getState().saving || validCount === 0) return
    const current = useReceiveDraft.getState()
    const slugs = new Set((current.draft?.lines ?? []).map((l) => l.materialSlug))
    const todo = [...picked.values()].filter((p) => !slugs.has(p.m.slug)).slice(0, capacity)
    if (!todo.some((p) => p.cat)) {
      addAndClose(todo.map((p) => p.m))
      return
    }
    confirming.current = true
    let ok = false
    try {
      ok = await confirmAction({
        title: t('importForms:pick.assignConfirm', {
          count: todo.filter((p) => p.cat).length,
          warehouse: warehouse?.name ?? '',
        }),
        confirmLabel: t('importForms:compose.scanAssign'),
        cancelLabel: t('common:cancel'),
      })
    } finally {
      confirming.current = false
    }
    if (!ok) return
    setFailLines(null)
    // Mở khoá sau mỗi lần chạy xong để bấm lại được; thành công thì tick đã xoá hết nên không PUT lặp.
    if (await guarded.run(todo)) guarded.reset()
  }

  const supplierSlug = draft ? formSupplierSlug(draft, user) : null
  const groups = useMemo(
    // Kết quả tìm trên server đã lọc theo từ khoá; danh sách tải hết thì lọc ở máy.
    () => splitBySupplier(source ?? [], supplierSlug, remote ? '' : term),
    [source, supplierSlug, remote, term],
  )
  const availableSlugs = new Set([...(all ?? []), ...(found.data?.items ?? [])].map((m) => m.slug))
  const catItems = useMemo(
    () =>
      (catalogOn && warehouseSlug
        ? notInWarehouse(catalog.data?.items ?? [], warehouseSlug, availableSlugs)
        : []
      ).map(catalogToAvailable),
    // `availableSlugs` dựng lại mỗi lần render; chỉ đổi khi nguồn của nó đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogOn, catalog.data, warehouseSlug, all, found.data],
  )
  const catById = new Map(catItems.map((m) => [m.slug, m]))
  const byId = new Map([...(all ?? []), ...(found.data?.items ?? [])].map((m) => [m.slug, m]))
  if (!draft) return null

  const supplierLabel =
    (supplierSlug
      ? supplierNameLookup({ suppliers: suppliers.data, lines: draft.lines, materials: all })(
          supplierSlug,
        )
      : null) ?? t('importForms:pick.supplierFallback')

  // Cửa sổ chung: `windowSize` thẻ đầu tính từ nhóm 1 sang nhóm 2.
  const mineShown = groups.mine.slice(0, windowSize)
  const othersShownItems = groups.others.slice(0, Math.max(0, windowSize - groups.mine.length))
  const total = groups.mine.length + groups.others.length
  const loadMore = () => {
    if (windowSize < total) setMore({ term, shown: windowSize + WINDOW_PAGE })
  }
  const toItem = (m: AvailableMaterial, withStock = true): PickItem => {
    const unit = baseUnitOf(m) ?? m.units[0]
    const exists = onForm.has(m.slug)
    // Tồn tính theo đơn vị gốc của vật tư.
    const stock = t('importForms:pick.stock', {
      n: formatQuantity(m.quantity, locale, 6),
      unit: (baseUnitOf(m) ?? unit)?.unitName ?? '',
    }).trim()
    const sellers = supplierNames(m.suppliers.map((s) => s.name))
    const subtitle = sellers ? t('importForms:pick.suppliers', { names: sellers }) : null
    return {
      id: m.slug,
      name: m.name,
      code: m.code,
      detail: withStock ? stock : null,
      subtitle,
      state: exists ? 'exists' : unit ? 'pickable' : 'locked',
      lockedLabel: unit ? undefined : t('importForms:pick.noUnit'),
      accessibilityLabel: [
        t('importForms:pick.a11y', { name: m.name, code: m.code, unit: unit?.unitName ?? '' }),
        ...(withStock ? [stock] : []),
        ...(subtitle ? [subtitle] : []),
        ...(exists
          ? [t('common:compose.pick.exists')]
          : unit
            ? []
            : [t('importForms:pick.noUnit')]),
      ].join(', '),
    }
  }
  const lockIfSaving = (it: PickItem): PickItem =>
    // Đang lưu / đang gắn kho: khoá mọi dòng (không nhãn).
    (saving || busy) && it.state === 'pickable' ? { ...it, state: 'locked' } : it
  const mineItems = mineShown.map((m) => lockIfSaving(toItem(m)))
  const othersItems = othersShownItems.map((m) => lockIfSaving(toItem(m)))
  const shownItems = [...mineItems, ...othersItems]
  const catPickItems = catItems.map((m) => lockIfSaving(toItem(m, false)))
  const hasSupplier = supplierSlug !== null
  // Tick thuộc nhóm "Vật tư khác" (có bên bán): sẽ được gắn vào bên bán khi lưu phiếu.
  const attachCount = hasSupplier
    ? [...picked.values()].filter(
        ({ m, cat }) =>
          !cat && !onForm.has(m.slug) && !m.suppliers.some((x) => x.slug === supplierSlug),
      ).length
    : 0
  const pinned = (
    <>
      <SearchField
        value={text}
        onChangeText={setText}
        placeholder={t('importForms:materialSearch')}
        shape="pill"
        raised
      />
      <PickSelectAllBar
        items={shownItems}
        checked={checked}
        capacityLeft={capacity - validCount}
        onSelectMany={selectMany}
        selectedCount={validCount}
      />
    </>
  )

  const retryButton = (onPress: () => void, busy: boolean) => (
    <View style={{ gap: 12, alignItems: 'center', paddingTop: 16 }}>
      <Text muted>{t('importForms:materialLoadFailedShort')}</Text>
      <Button variant="outline" loading={busy} onPress={onPress}>
        {t('common:retry')}
      </Button>
    </View>
  )
  const spinner = (
    <ActivityIndicator
      accessibilityLabel={t('importForms:addLine.loading')}
      color={colors.mutedForeground}
      style={{ paddingTop: 16 }}
    />
  )
  // Chưa có gì để chia nhóm: lỗi / đang tải danh sách (hoặc kết quả tìm trên server).
  const notReady =
    search.isError && !all
      ? retryButton(() => void search.refetch({ cancelRefetch: false }), search.isFetching)
      : !all
        ? spinner
        : remote && found.isError && !found.data
          ? retryButton(() => void found.refetch({ cancelRefetch: false }), found.isFetching)
          : remote && !found.data
            ? spinner
            : null
  const noMatch = (
    <Text muted style={{ textAlign: 'center', paddingTop: 16 }}>
      {t('importForms:materialEmpty')}
    </Text>
  )
  const capacityLabel = t('importForms:itemsMaxReached')

  // "+ Tạo vật tư mới": đủ quyền tạo + gắn kho, có từ khoá, phiếu có slug. THAY sheet chọn bằng form vật tư
  // (`replace`, không chồng hai sheet); form xong đóng thì về phiếu, dòng mới + sheet dòng tự mở.
  const openCreate = async () => {
    if (!formSlug || confirming.current || busy || useReceiveDraft.getState().saving) return
    // Đang có tick: mở form tạo sẽ bỏ sheet này (và các tick) → hỏi trước; huỷ giữ nguyên.
    if (validCount > 0) {
      confirming.current = true
      let ok = false
      try {
        ok = await confirmAction({
          title: t('importForms:pick.createDropsTicks', { count: validCount }),
          confirmLabel: t('importForms:pick.createNewShort'),
          cancelLabel: t('common:cancel'),
        })
      } finally {
        confirming.current = false
      }
      if (!ok) return
    }
    router.replace({
      pathname: '/material-form',
      params: {
        importForm: formSlug,
        ...(BUSINESS_CODE_REGEX.test(term) && /[0-9-]/.test(term)
          ? { code: term }
          : { name: term }),
      },
    })
  }
  // Route `/material-form` bị khoá khi thiếu MATERIAL_READ → cần cả quyền đọc.
  const createNew =
    !!formSlug && term !== '' && canCreateInWarehouse(user) && materialAbilities(user).read ? (
      <Button variant="outline" disabled={busy || saving} onPress={() => void openCreate()}>
        {t('importForms:pick.createNew', { query: term })}
      </Button>
    ) : null

  const catalogGroup = !catalogOn ? null : catalog.isError && !catalog.data ? (
    <Text muted size={14} style={{ paddingHorizontal: 18 }}>
      {t('importForms:materialLoadFailedShort')}
    </Text>
  ) : !catalog.data ? (
    spinner
  ) : catPickItems.length > 0 ? (
    <View style={{ gap: 4 }}>
      <ComposeSectionHeader
        title={t('importForms:pick.groupNotInWarehouse', { count: catPickItems.length })}
      />
      <Text muted size={13} style={{ paddingHorizontal: 18, paddingBottom: 4 }}>
        {t('importForms:pick.notInWarehouseHint', { warehouse: warehouse?.name ?? '' })}
      </Text>
      <MaterialPickList
        items={catPickItems}
        checked={checked}
        onToggle={onToggle}
        capacityLeft={capacity - validCount}
        capacityLabel=""
      />
    </View>
  ) : null

  const lists =
    notReady ??
    (total === 0 ? (
      catPickItems.length > 0 ? null : (
        // Kho không có vật tư nào / không khớp từ khoá: chỉ một câu (không kèm `mineEmpty`).
        noMatch
      )
    ) : !hasSupplier ? (
      <MaterialPickList
        items={othersItems}
        checked={checked}
        onToggle={onToggle}
        capacityLeft={capacity - validCount}
        capacityLabel={capacityLabel}
      />
    ) : (
      <View style={{ gap: 8 }}>
        {mineItems.length > 0 ? (
          <View style={{ gap: 4 }}>
            <ComposeSectionHeader
              title={t('importForms:pick.groupMine', {
                name: supplierLabel,
                count: groups.mine.length,
              })}
            />
            <MaterialPickList
              items={mineItems}
              checked={checked}
              onToggle={onToggle}
              capacityLeft={capacity - validCount}
              capacityLabel={capacityLabel}
            />
          </View>
        ) : term === '' ? (
          <Text muted size={14} style={{ paddingHorizontal: 18 }}>
            {t('importForms:pick.mineEmpty', { name: supplierLabel })}
          </Text>
        ) : null}
        {othersItems.length > 0 ? (
          <View style={{ gap: 4 }}>
            <ComposeSectionHeader
              title={t('importForms:pick.groupOthers', { count: groups.others.length })}
            />
            <Text muted size={13} style={{ paddingHorizontal: 18, paddingBottom: 4 }}>
              {t('importForms:pick.othersHint', { name: supplierLabel })}
            </Text>
            <MaterialPickList
              items={othersItems}
              checked={checked}
              onToggle={onToggle}
              capacityLeft={capacity - validCount}
              // Nhóm 1 đã báo đủ dòng thì nhóm 2 không báo lại.
              capacityLabel={mineItems.length > 0 ? '' : capacityLabel}
            />
          </View>
        ) : null}
      </View>
    ))

  return (
    <SheetScaffold
      testID="import-pick-sheet"
      title={t('importForms:addLine.title')}
      cancelLabel={t('common:close')}
      onCancel={close}
      onEndReached={loadMore}
      top={all ? pinned : undefined}
      footer={saving ? t('importForms:receive.line.savingNote') : undefined}
      bottom={
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          <Button
            variant="accent"
            capsule
            disabled={validCount === 0 || saving || busy}
            loading={busy}
            onPress={() => void confirm()}
          >
            {t('importForms:pick.addCount', { count: validCount })}
          </Button>
          {assignCount > 0 ? (
            <Text size={13} muted style={{ textAlign: 'center', paddingTop: 8 }}>
              {t('importForms:pick.willAssign', {
                count: assignCount,
                warehouse: warehouse?.name ?? '',
              })}
            </Text>
          ) : null}
          {attachCount > 0 ? (
            <Text size={13} muted style={{ textAlign: 'center', paddingTop: 8 }}>
              {t('importForms:pick.willAttach', { count: attachCount, name: supplierLabel })}
            </Text>
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        {truncated ? (
          <Text muted size={13} style={{ paddingHorizontal: 18 }}>
            {t('importForms:pick.truncated')}
          </Text>
        ) : null}
        {failLines ? <ErrorBox lines={failLines} style={{ marginHorizontal: 16 }} /> : null}
        {lists}
        {catalogGroup}
        {createNew}
      </View>
    </SheetScaffold>
  )
}

/** Tên bên bán gắn với vật tư: 2 tên đầu, còn lại "+n". Không có → `null`. */
function supplierNames(names: readonly string[]): string | null {
  if (names.length === 0) return null
  const shown = names.slice(0, 2).join(', ')
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown
}
