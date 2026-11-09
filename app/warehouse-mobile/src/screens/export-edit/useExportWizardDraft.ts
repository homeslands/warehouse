import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import {
  canCreateExportForm,
  exportFormAbilities,
  isExportFormNotFoundError,
  useExportForm,
  type ExportForm,
  type ExportFormAbilities,
  type ExportFormAccess,
} from '@/entities/export-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  isDirty,
  newExportDraft,
  useExportDraft,
  type DraftContext,
  type ExportDraft,
} from '@/features/export-draft'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import { missingForStep, type MissingItem } from '@/shared/lib/missing'
import { useWizardNav } from '@/shared/lib/useWizardNav'
import { useIsStackTop, useStepNoticeLifetime } from '@/shared/lib/wizard-screen'

import { suggestExportCode } from './ExportHeaderFields'
import { exportMissing } from './export-missing'
import { conflictMessage } from './useExportActions'

/** Route của ba bước phiếu xuất trong Stack modal (`app/export-form/[formSlug]/…`). */
const ROUTES = { 1: '[formSlug]/info', 2: '[formSlug]/edit', 3: '[formSlug]/review' } as const
const PATHS = {
  1: '/export-form/[formSlug]/info',
  2: '/export-form/[formSlug]/edit',
  3: '/export-form/[formSlug]/review',
} as const

/** Đầu phiếu của bản trắng (phiếu mới). */
const BLANK_HEADER = newExportDraft().header

/**
 * Phiếu mới "có gì để lưu / để bỏ": có dòng, hoặc đầu phiếu khác bản trắng. Mã chỉ tính khi biết mã gợi
 * ý lúc dựng bản trắng (`seededCode`) — bản nháp mở lại từ máy đã có mã riêng.
 */
function newFormEdited(draft: ExportDraft, seededCode: string | null): boolean {
  const h = draft.header
  return (
    draft.lines.length > 0 ||
    (seededCode !== null && h.code !== seededCode) ||
    (['type', 'purchaseOrder', 'invoiceCode', 'receiver', 'note', 'file'] as const).some(
      (f) => h[f] !== BLANK_HEADER[f],
    )
  )
}

/** Bản nháp chỉ là bản trắng (chưa có gì của người dùng). */
const isBlank = (d: ExportDraft | null) =>
  !!d && d.version === null && d.lines.length === 0 && !newFormEdited(d, '')

/**
 * Mã gợi ý của bản trắng phiếu mới đang có trong store, theo (người dùng, kho) — dùng chung cho mọi
 * bước (bản trắng chỉ được dựng ở bước nạp nó, bước sau cần biết để tính "đã sửa mã chưa").
 */
const seededCodes = new Map<string, string>()

export type ExportWizardDraft = {
  /** Bản nháp đã nạp đúng (người dùng, kho, phiếu) và được sửa (phiếu mới có quyền / Nháp `canEdit`). */
  ready: boolean
  /** Bản nháp của phiếu — chỉ khi `ready`. */
  draft: ExportDraft | null
  /** Phiếu trên server (phiếu mới, phiếu đã mất → `undefined`). */
  form: ExportForm | undefined
  abilities: ExportFormAbilities | null
  ctx: DraftContext | null
  isNew: boolean
  /** Đang ghi lên server (store `saving`): mọi sửa trên máy bị khoá. */
  saving: boolean
  /** Bước 1 đủ: không còn ô đầu phiếu thiếu / sai. */
  step1Ok: boolean
  /** Bước 2 đủ: có dòng, không dòng nào thiếu số / giá, không trùng, không quá số dòng. */
  step2Ok: boolean
  /** `exportMissing` của bản nháp (rỗng khi chưa `ready`); tách theo bước bằng `missingForStep`. */
  missing: MissingItem[]
  /** Có gì để lưu / để bỏ: phiếu đã có → `isDirty`; phiếu mới → có dòng hoặc đầu phiếu khác bản trắng. */
  dirty: boolean
  /** Truy vấn phiếu (làm mới, lỗi làm mới) — phiếu mới không gọi. */
  query: ReturnType<typeof useExportForm>
  /** Lần tải đầu thất bại (chưa có phiếu để hiện) + lỗi đó (giữ lỗi cuối khi đang thử lại). */
  failedFirstLoad: boolean
  loadError: unknown
  /** Điều hướng ba bước của tab Xuất (`useWizardNav`). */
  nav: ReturnType<typeof useWizardNav>
}

/**
 * Nạp + gác quyền bản nháp phiếu xuất cho MỘT màn bước của luồng 3 bước (modal
 * `/export-form/[formSlug]/info`, `/edit`, `/review`). Gọi ở mọi bước; các bước cùng đọc một store `useExportDraft`.
 *
 * - `'new'` cần `EXPORT_FORM_CREATE` (không có → `nav.finishToList`); Nháp mà không `canEdit` → màn xem
 *   (`nav.finish`); phiếu không còn Nháp → bỏ bản nháp (hộp thoại nếu đã sửa) rồi về màn xem.
 * - Phiếu mới: store chưa có bản nháp `'new'` của (người dùng, kho) → `load`; không có bản lưu → bản
 *   trắng có mã gợi ý (`seed`, CHỈ bộ nhớ tới lần sửa đầu tiên).
 * - Phiếu đã có: nạp khi phiếu về; version trên server đổi → nạp lại (gộp) và báo qua `useFormNotice`.
 *   Store đã có đúng bản nháp của phiếu (cùng version) → không nạp lại (bước sau mở trên bước trước).
 * - Chỉ màn ở ĐỈNH Stack modal nạp / rời màn: các bước của cùng phiếu có thể cùng gắn (bước 1 đẩy lên
 *   trên bước 2) và effect của chúng chạy cùng lượt — hai màn cùng nạp sẽ gộp / báo hai lần, cùng rời
 *   màn sẽ rời hai lần.
 * - Đổi kho → `nav.exit()` (đóng modal). Rời hết các bước của phiếu → bỏ thông báo mức phiếu của nó.
 */
export function useExportWizardDraft(formSlug: string): ExportWizardDraft {
  const { t } = useTranslation(['exportForms', 'common'])
  const isTop = useIsStackTop()
  const isNew = formSlug === 'new'
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const nav = useWizardNav({
    formSlug,
    tab: 'export',
    routes: ROUTES,
    paths: PATHS,
    listPath: '/export',
    viewPath: '/export/[formSlug]',
  })
  const user = useAuthStore((s) => s.user)
  const userSlug = user?.userSlug ?? null

  // Đổi kho khi modal mở → đóng modal (chỉ màn ở đỉnh Stack modal); màn trong tab tự về danh sách
  // (`useLeaveOnWarehouseChange` của chúng). Lần hiện đầu không rời; kho bị xoá (hết phiên) để
  // SessionGate lo.
  const shownWarehouse = useRef(warehouseSlug)
  useEffect(() => {
    if (warehouseSlug === shownWarehouse.current) return
    shownWarehouse.current = warehouseSlug
    if (warehouseSlug && isTop()) nav.exit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseSlug])

  const query = useExportForm(warehouseSlug, isNew ? undefined : formSlug)
  const gone = isExportFormNotFoundError(query.error)
  const form = isNew || gone ? undefined : query.data
  const [lastError, setLastError] = useState<unknown>(null)
  if (query.error && query.error !== lastError) setLastError(query.error)
  const failedFirstLoad = !form && query.errorUpdateCount > 0 && (gone || !query.isSuccess)

  const access = useMemo<ExportFormAccess | null>(
    () => (user ? { can: (c) => can(user, c), userSlug: user.userSlug ?? null } : null),
    [user],
  )
  const abilities = useMemo(
    () =>
      !access
        ? null
        : isNew
          ? exportFormAbilities(access, 'new')
          : form
            ? exportFormAbilities(access, form)
            : null,
    [isNew, form, access],
  )
  const ctx = useMemo<DraftContext | null>(
    () => (userSlug && warehouseSlug && formSlug ? { userSlug, warehouseSlug, formSlug } : null),
    [userSlug, warehouseSlug, formSlug],
  )
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Màn bước cuối cùng của phiếu tháo ra (rời luồng) → bỏ thông báo mức phiếu của nó.
  useStepNoticeLifetime('export', formSlug)

  // Phiếu mới: chỉ khi có EXPORT_FORM_CREATE (mở thẳng / mất quyền → về danh sách).
  const deniedNew = isNew && !!access && !canCreateExportForm(access)
  useEffect(() => {
    if (deniedNew && isTop()) nav.finishToList()
    // `nav` / `isTop` đổi định danh theo `navigation`: chỉ rời một lần khi điều kiện bật.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deniedNew])

  // Phiếu Nháp mà người dùng không sửa được (mở thẳng, mất quyền) → màn xem (ở đó có nút theo quyền).
  const cannotEdit = !isNew && form?.status === 'DRAFT' && !!abilities && !abilities.canEdit
  useEffect(() => {
    if (cannotEdit && formSlug && isTop()) nav.finish(formSlug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cannotEdit, formSlug])

  // Phiếu mới: nạp bản nháp `'new'` của (người dùng, kho); chưa có bản lưu → bản trắng có mã gợi ý, CHỈ
  // trong bộ nhớ (`seed`) — lần sửa đầu tiên mới ghi `kv`. Kho lúc mở màn: đổi kho thì modal đóng
  // (`nav.exit`), tab về danh sách, không nạp bản nháp của kho mới ở đây.
  const newWarehouse = useRef(warehouseSlug)
  const seedKey = `${userSlug}|${warehouseSlug}`
  /** Vẽ lại khi màn này vừa dựng bản trắng (mã gợi ý nằm ở `seededCodes`). */
  const [, setSeeded] = useState(0)
  useEffect(() => {
    if (!isNew || deniedNew || !access || !userSlug || !warehouseSlug) return
    if (warehouseSlug !== newWarehouse.current) return
    const store = useExportDraft.getState()
    const c = store.ctx
    const inMemory =
      c?.userSlug === userSlug &&
      c.warehouseSlug === warehouseSlug &&
      c.formSlug === 'new' &&
      !!store.draft
    if (inMemory || !isTop()) return
    let alive = true
    seededCodes.delete(seedKey)
    void store.load({ userSlug, warehouseSlug, formSlug: 'new' }, null).then((r) => {
      const d = useExportDraft.getState()
      const mine =
        d.ctx?.userSlug === userSlug &&
        d.ctx.warehouseSlug === warehouseSlug &&
        d.ctx.formSlug === 'new'
      if (!alive || !mine || r.local || !isBlank(d.draft)) return
      const blank = newExportDraft({ code: suggestExportCode(), type: 'PRODUCTION' })
      d.seed(blank)
      seededCodes.set(seedKey, blank.header.code)
      setSeeded((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // Chỉ cần biết đã có `access` (đổi định danh khi `user` đổi).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, deniedNew, !!access, userSlug, warehouseSlug])

  // Nạp bản nháp trên máy khi phiếu về (và khi version trên server đổi → gộp). Không ghi server. Đang
  // Lưu / Gửi duyệt thì KHÔNG nạp (một lần tải lại về giữa chừng sẽ gộp nhầm); `useExportActions` tự
  // đưa bản nháp theo phiếu server, mở khoá xong chỉ nạp lại nếu cache còn lệch version với bản nháp.
  const formVersion = form?.version
  const saving = useExportDraft((s) => s.saving)
  const skippedWhileSaving = useRef(false)
  const canEdit = !!abilities?.canEdit
  useEffect(() => {
    if (!form || !ctx || isNew || !isTop()) return
    const store = useExportDraft.getState()
    const mine = store.ctx?.warehouseSlug === ctx.warehouseSlug && store.ctx.formSlug === formSlug
    if (saving && mine) {
      skippedWhileSaving.current = true
      return
    }
    if (skippedWhileSaving.current) {
      skippedWhileSaving.current = false
      const d = store.draft
      // Bản nháp của phiếu này đã theo phiếu server (Lưu / gộp), hoặc đã bị bỏ (gửi duyệt / xoá xong,
      // phiếu mất — `useExportActions` đã báo và rời màn) → không nạp lại, không rời màn lần nữa.
      if (mine && (!d || (form.status === 'DRAFT' && d.version === form.version))) return
    }
    if (form.status === 'DRAFT') {
      if (!canEdit) return
      // Bước khác của luồng đã nạp đúng bản nháp này (cùng version) → không nạp lại.
      const loaded =
        mine && store.ctx?.userSlug === ctx.userSlug && store.draft?.version === form.version
      if (loaded) return
      void store.load(ctx, form).then((r) => {
        if (r.merged && r.edited && mounted.current) {
          useFormNotice
            .getState()
            .show({ kind: 'export', formSlug, message: conflictMessage(r, t) })
        }
      })
      return
    }
    // Phiếu không còn Nháp (gửi duyệt / huỷ ở nơi khác): bản lưu vô nghĩa → bỏ, báo nếu đã sửa, về màn xem.
    void store.load(ctx, form).then(async (r) => {
      await useExportDraft.getState().discard()
      if (!mounted.current) return
      if (r.edited) {
        Alert.alert(t('exportForms:edit.actions.goneTitle'), t('exportForms:edit.actions.gone'))
      }
      nav.finish(form.slug)
    })
    // `form` đổi định danh mỗi lần refetch; chỉ nạp lại khi slug/version/trạng thái đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSlug, formVersion, form?.status, ctx, !!form, saving, canEdit])

  const storeDraft = useExportDraft((s) => s.draft)
  const draftCtx = useExportDraft((s) => s.ctx)
  const ready =
    !!storeDraft &&
    draftCtx?.formSlug === formSlug &&
    draftCtx.warehouseSlug === warehouseSlug &&
    !deniedNew &&
    (isNew || (form?.status === 'DRAFT' && canEdit))
  const draft = ready ? storeDraft : null
  const seededCode = isNew ? (seededCodes.get(seedKey) ?? null) : null
  const dirty = !draft
    ? false
    : isNew
      ? newFormEdited(draft, seededCode)
      : !!form && isDirty(draft, form)

  const missing = useMemo(() => (draft ? exportMissing(draft, t) : []), [draft, t])
  const step1Ok = !!draft && missingForStep(missing, 1).length === 0
  const step2Ok = !!draft && missingForStep(missing, 2).length === 0

  return {
    ready,
    draft,
    form,
    abilities,
    ctx,
    isNew,
    saving,
    step1Ok,
    step2Ok,
    missing,
    dirty,
    query,
    failedFirstLoad,
    loadError: query.error ?? lastError,
    nav,
  }
}
