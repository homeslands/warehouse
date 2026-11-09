import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import {
  canCreateImportForm,
  importFormAbilities,
  useAvailableMaterialPages,
  useImportForm,
  useSuppliers,
  type AvailableMaterial,
  type ImportFormAccess,
} from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { MAX_ITEMS, useReceiveDraft } from '@/features/receive-checklist'
import { formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useLineFocus } from '@/shared/lib/line-focus'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTheme } from '@/shared/theme/useTheme'
import {
  Button,
  MaterialPickList,
  SearchField,
  SheetScaffold,
  Text,
  type PickItem,
} from '@/shared/ui'

import { addImportLines } from './add-import-lines'
import { baseUnitOf } from './import-units'

/**
 * Route `/import-pick` — bộ chọn NHIỀU vật tư cho phiếu nhập đang soạn. Danh sách từ server
 * (`available-materials`): ô tìm trống = mọi vật tư của kho (sắp theo mã), gõ = lọc tên / mã; trang 50,
 * cuộn tới cuối tải trang sau. Mỗi dòng: ô tick, tên, mã, "Bên bán: …" (tối đa 2 tên + "+n"), bên phải
 * "Tồn n <đơn vị gốc>". Vật tư đã có trên phiếu (bất kỳ đơn vị) ghi "đã có", chưa khai đơn vị ghi "Chưa có
 * đơn vị" — đều không tick được. Tick giữ qua lần đổi từ khoá (giữ nguyên bản `AvailableMaterial` đã
 * tick vì kết quả tìm đổi theo từ khoá). Sức chứa = 200 − số dòng. Nút đáy "Thêm n vật tư" →
 * `addImportLines` (theo thứ tự tick), đóng sheet, bước 2 tự mở sheet sửa của dòng đầu. Tự đóng khi
 * không còn bản nháp hoặc người dùng không soạn được phiếu (phiếu mới: `canCreateImportForm`; phiếu đã
 * có: `importFormAbilities(...).canAddLine` = sửa được + IMPORT_FORM_CREATE).
 */
export function ImportPickMaterialsSheetScreen() {
  const { t, i18n } = useTranslation(['importForms', 'common'])
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const { colors } = useTheme()
  const close = useCloseSheet()

  const draft = useReceiveDraft((s) => s.draft)
  const formSlug = useReceiveDraft((s) => s.ctx?.formSlug)
  const saving = useReceiveDraft((s) => s.saving)
  const user = useAuthStore((s) => s.user)
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const isNew = formSlug === 'new'
  const formQuery = useImportForm(warehouseSlug, formSlug && !isNew ? formSlug : undefined)
  // Phiếu mới: tên bên bán đầu phiếu (bản nháp chỉ giữ slug) lấy từ danh sách bên bán (cache).
  const suppliers = useSuppliers(isNew && !!user && can(user, 'SUPPLIER_READ'))
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
  const search = useAvailableMaterialPages(warehouseSlug, term)
  // Vật tư đã tick (theo thứ tự tick), giữ cả bản `AvailableMaterial` để không mất khi kết quả tìm đổi.
  const [picked, setPicked] = useState<ReadonlyMap<string, AvailableMaterial>>(new Map())

  const lines = draft?.lines
  const onForm = useMemo(() => new Set((lines ?? []).map((l) => l.materialSlug)), [lines])
  const capacity = Math.max(0, MAX_ITEMS - (lines?.length ?? 0))
  // Tick còn hiệu lực: vật tư đã tick mà vừa thành "đã có" (vd quét thêm) không tính.
  const validCount = useMemo(
    () => [...picked.keys()].filter((slug) => !onForm.has(slug)).length,
    [picked, onForm],
  )
  const checked = useMemo<ReadonlySet<string>>(() => new Set(picked.keys()), [picked])

  const toggle = (m: AvailableMaterial) => {
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(m.slug)) next.delete(m.slug)
      else if ([...next.keys()].filter((slug) => !onForm.has(slug)).length < capacity)
        next.set(m.slug, m)
      else return prev
      return next
    })
    haptics.selection()
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
        next.set(id, m)
      }
      return next
    })
  }

  const confirm = () => {
    if (useReceiveDraft.getState().saving || validCount === 0) return
    const current = useReceiveDraft.getState()
    const slugs = new Set((current.draft?.lines ?? []).map((l) => l.materialSlug))
    const todo = [...picked.values()].filter((m) => !slugs.has(m.slug)).slice(0, capacity)
    const keys = addImportLines(todo, {
      isNew,
      supplierName: (slug) => suppliers.data?.find((s) => s.slug === slug)?.name ?? null,
    })
    if (keys.length === 0) {
      haptics.error()
      return
    }
    const slug = current.ctx?.formSlug
    if (slug) useLineFocus.getState().ask('import', slug, keys[0])
    haptics.success()
    close()
  }

  // Các trang đã tải, gộp theo `slug` (trang sau có thể lặp vật tư của trang trước khi dữ liệu đổi).
  const results = useMemo(() => {
    const seen = new Set<string>()
    return (search.data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((m) => (seen.has(m.slug) ? false : (seen.add(m.slug), true)))
  }, [search.data])
  const byId = new Map(results.map((m) => [m.slug, m]))
  if (!draft) return null

  const loadMore = () => {
    if (search.hasNextPage && !search.isFetchingNextPage && !search.isError)
      void search.fetchNextPage({ cancelRefetch: false })
  }
  const items: PickItem[] = results.map((m) => {
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
      detail: stock,
      subtitle,
      state: exists ? 'exists' : unit ? 'pickable' : 'locked',
      lockedLabel: unit ? undefined : t('importForms:pick.noUnit'),
      accessibilityLabel: [
        t('importForms:pick.a11y', { name: m.name, code: m.code, unit: unit?.unitName ?? '' }),
        stock,
        ...(subtitle ? [subtitle] : []),
        ...(exists
          ? [t('common:compose.pick.exists')]
          : unit
            ? []
            : [t('importForms:pick.noUnit')]),
      ].join(', '),
    }
  })
  // Đang lưu: khoá mọi dòng (không nhãn).
  if (saving) for (const it of items) if (it.state === 'pickable') it.state = 'locked'

  const searchHeader = (
    <SearchField
      value={text}
      onChangeText={setText}
      placeholder={t('importForms:materialSearch')}
      shape="pill"
    />
  )

  const empty =
    search.isError && !search.data ? (
      <View style={{ gap: 12, alignItems: 'center', paddingTop: 16 }}>
        <Text muted>{t('importForms:materialLoadFailedShort')}</Text>
        <Button
          variant="outline"
          loading={search.isFetching}
          onPress={() => void search.refetch({ cancelRefetch: false })}
        >
          {t('common:retry')}
        </Button>
      </View>
    ) : !search.data ? (
      <ActivityIndicator
        accessibilityLabel={t('importForms:addLine.loading')}
        color={colors.mutedForeground}
        style={{ paddingTop: 16 }}
      />
    ) : (
      <Text muted style={{ textAlign: 'center', paddingTop: 16 }}>
        {t('importForms:materialEmpty')}
      </Text>
    )

  return (
    <SheetScaffold
      testID="import-pick-sheet"
      title={t('importForms:addLine.title')}
      cancelLabel={t('common:close')}
      onCancel={close}
      onEndReached={loadMore}
      footer={saving ? t('importForms:receive.line.savingNote') : undefined}
      bottom={
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          <Button variant="accent" capsule disabled={validCount === 0 || saving} onPress={confirm}>
            {t('importForms:pick.addCount', { count: validCount })}
          </Button>
        </View>
      }
    >
      <MaterialPickList
        items={items}
        checked={checked}
        onToggle={(slug) => {
          const m = byId.get(slug) ?? picked.get(slug)
          if (m) toggle(m)
        }}
        capacityLeft={capacity - validCount}
        onSelectMany={selectMany}
        selectedCount={validCount}
        capacityLabel={t('importForms:itemsMaxReached')}
        header={searchHeader}
        empty={empty}
      />
      {/* Trang tiếp theo: vòng quay khi đang tải; lỗi → báo + "Thử lại". */}
      {search.isFetchingNextPage ? (
        <ActivityIndicator
          testID="import-pick-more"
          accessibilityLabel={t('importForms:pick.loadingMore')}
          color={colors.mutedForeground}
          style={{ paddingTop: 16 }}
        />
      ) : search.isFetchNextPageError ? (
        <View style={{ gap: 12, alignItems: 'center', paddingTop: 16 }}>
          <Text muted>{t('importForms:pick.loadMoreFailed')}</Text>
          <Button
            variant="outline"
            onPress={() => void search.fetchNextPage({ cancelRefetch: false })}
          >
            {t('common:retry')}
          </Button>
        </View>
      ) : null}
    </SheetScaffold>
  )
}

/** Tên bên bán gắn với vật tư: 2 tên đầu, còn lại "+n". Không có → `null`. */
function supplierNames(names: readonly string[]): string | null {
  if (names.length === 0) return null
  const shown = names.slice(0, 2).join(', ')
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown
}
