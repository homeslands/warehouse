import { useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import {
  createExportForm,
  deleteExportForm,
  exportFormErrorMessage,
  exportFormKeys,
  fetchExportForm,
  fetchExportForms,
  isBatchOutOfStockError,
  isExportFormNotFoundError,
  isNotDraftError,
  isShortageError,
  isStaleExportFormError,
  submitExportForm,
  updateExportForm,
  type ExportForm,
  type ExportFormAbilities,
} from '@/entities/export-form'
import { fetchAllInventory, fetchMaterialBatches, inventoryKeys } from '@/entities/inventory'
import { getSessionEpoch } from '@/entities/session'
import {
  canSave,
  detectShortages,
  exportDraftStorageKey,
  isDirty,
  linesTotal,
  MAX_ITEMS,
  mergeAfterConflict,
  toInput,
  useExportDraft,
  type CanSave,
  type DraftContext,
  type ExportDraft,
  type ExportHeaderField,
  type ExportLine,
  type Shortage,
} from '@/features/export-draft'
import { isAttachmentUploading } from '@/features/form-attachment'
import { isApiError } from '@/shared/api/http'
import { useCodeTaken, useCodeTakenMessage } from '@/shared/lib/code-taken.store'
import { useFormNotice, type FormNotice } from '@/shared/lib/form-notice.store'
import { formatMoney, type FormatLocale } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { round6 } from '@/shared/lib/round'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'
import type { WizardNav } from '@/shared/lib/useWizardNav'
import { kv } from '@/shared/storage/kv'

import { names } from './export-review'

export type ExportActionKind = 'save' | 'submit' | 'delete'

export type ExportActionsContext = {
  /** Bản nháp của màn (người dùng, kho, phiếu | `'new'`); `null` khi chưa đủ thông tin. */
  ctx: DraftContext | null
  /** Phiếu trên server lúc này (cache `useExportForm`); phiếu mới thì `undefined`. */
  form: ExportForm | undefined
  /** `exportFormAbilities(access, form | 'new')`. */
  abilities: ExportFormAbilities | null
}

/**
 * Điều hướng sau một lần ghi — màn bước truyền từ `nav` của luồng 3 bước (`exportWizardLeave`), để
 * MỌI lần rời luồng đi qua `useWizardNav` (không route bước nào còn nằm dưới màn xem).
 */
export type ExportLeave = {
  /** Ghi xong → màn xem phiếu `slug` (bỏ mọi bước của phiếu, kể cả `'new'`). */
  toView: (slug: string) => void
  /** Xoá nháp xong → danh sách. */
  toList: () => void
  /** Thiếu hàng → bước 2 (thẻ thiếu, nếu dò ra, được tô ở đó). */
  toItems: () => void
  /** Trùng mã → bước 1 (lỗi dưới ô Mã phiếu). */
  toInfo: () => void
  /** Phiếu mới đã tạo nhưng cần xem lại → màn xem `slug` dưới (trong tab), modal ở bước 2 của `slug`. */
  reopen: (slug: string) => void
}

/** `leave` của các màn bước phiếu xuất, theo `nav` của `useExportWizardDraft`. */
export function exportWizardLeave(nav: WizardNav): ExportLeave {
  return {
    toView: nav.finish,
    toList: nav.finishToList,
    toItems: () => nav.goToStep(2),
    toInfo: () => nav.goToStep(1),
    reopen: nav.reopen,
  }
}

export type ExportActions = {
  /**
   * Hỏi lại rồi ghi: phiếu mới → POST; phiếu có → PATCH; xong → `leave.toView`. Trùng mã → ở lại,
   * `codeError` + `leave.toInfo`.
   */
  save: () => Promise<void>
  /**
   * (POST / PATCH nếu cần) → submit; xong thì bỏ bản nháp, `leave.toView`. KHÔNG hỏi lại: chỉ bước 3
   * "Xác nhận" gửi duyệt, chính bước đó là bước xác nhận (spec §6). Thiếu hàng → thông báo kèm dòng
   * thiếu + `leave.toItems`.
   */
  submit: () => Promise<void>
  /** Hỏi lại (nguy hiểm) → DELETE; xong thì bỏ bản nháp, `leave.toList`. */
  remove: () => Promise<void>
  /**
   * Đang gửi request nào từ màn này (mọi nút đều khoá khi khác `null`). Ghi xong mà rời luồng (`leave`)
   * → giữ nguyên tới khi màn tháo ra.
   */
  busy: ExportActionKind | null
  /**
   * Phiếu mới bị server từ chối vì trùng mã (101404 của phiếu khác / 101405 mã đang giữ bởi phiếu đã
   * xoá), đã dịch — bước 1 báo dưới ô Mã phiếu. Mất khi mã trong bản nháp đổi. Dùng chung mọi bước
   * (store cấp module) vì lần Lưu có thể bắt đầu ở bước 2 / 3 rồi về bước 1.
   */
  codeError: string | null
}

/** Mã phiếu đã tồn tại (có thể chính là phiếu lần Lưu trước đã tạo nhưng mất phản hồi). */
const CODE_EXISTS_CODE = 101404
/** Trùng mã / mã đang giữ bởi phiếu đã xoá → ở lại màn soạn, báo dưới ô mã (câu `exportForms:errors.*`). */
const CODE_TAKEN: Readonly<Record<number, string>> = {
  [CODE_EXISTS_CODE]: 'codeExists',
  101405: 'codeReserved',
}

const P = 'exportForms:edit.actions'

/** Dòng lúc dò thiếu hàng: dấu chỉ còn hiện khi dòng vẫn y như vậy. */
type LineSnapshot = { quantity: number; unitSlug: string; batchSlug: string | null }
type Detected = { shortage: Shortage; at: LineSnapshot }
type Notice = { message: string; shortages: ReadonlyMap<string, Detected> }

const NO_DETECTED: ReadonlyMap<string, Detected> = new Map()

const sameLine = (l: ExportLine, at: LineSnapshot) =>
  round6(l.quantity) === round6(at.quantity) &&
  l.unitSlug === at.unitSlug &&
  l.batchSlug === at.batchSlug

/** Lỗi đã xử lý xong, chỉ còn hiện câu báo (đã dịch) — `onError` của `useGuardedAction` nhận. */
class ExportNotice extends Error {
  constructor(
    message: string,
    readonly shortages: ReadonlyMap<string, Detected> = NO_DETECTED,
    /** Lỗi thiếu hàng (kể cả khi không dò ra dòng nào) → về bước 2 (spec §6). */
    readonly shortage: boolean = shortages.size > 0,
  ) {
    super(message)
  }
}

/**
 * Thông báo mức phiếu (`useFormNotice`) của phiếu xuất `formSlug`, kèm dòng thiếu hàng nếu có: khoá dòng
 * ở `shortageKeys`, chi tiết ("Thiếu n" / "Lô chỉ còn n" + dòng lúc dò) ở `detail` (`Map` khoá → `Detected`).
 */
function showNotice({ message, shortages }: Notice, formSlug: string) {
  useFormNotice.getState().show(
    shortages.size > 0
      ? {
          kind: 'export',
          formSlug,
          message,
          shortageKeys: [...shortages.keys()],
          detail: shortages,
        }
      : { kind: 'export', formSlug, message },
  )
}

/**
 * Dòng thiếu hàng của thông báo mức phiếu `notice` để bước 2 tô thẻ: khoá dòng → chi tiết thiếu (chỉ
 * khi dòng còn y như lúc dò — sửa số lượng / đơn vị / lô thì dấu của dòng đó mất, đổi về đúng như cũ thì
 * hiện lại), hoặc `true` khi thông báo chỉ có khoá dòng.
 */
export function noticeShortages(
  notice: FormNotice | null,
  lines: readonly ExportLine[] | undefined,
): ReadonlyMap<string, Shortage | true> {
  const keys = notice?.shortageKeys
  if (!notice || !keys || keys.length === 0) return NO_MARKS
  const detected =
    notice.detail instanceof Map ? (notice.detail as ReadonlyMap<string, Detected>) : undefined
  const out = new Map<string, Shortage | true>()
  for (const key of keys) {
    const d = detected?.get(key)
    if (!d) out.set(key, true)
    else {
      const line = lines?.find((l) => l.key === key)
      if (line && sameLine(line, d.at)) out.set(key, d.shortage)
    }
  }
  return out
}

const NO_MARKS: ReadonlyMap<string, Shortage | true> = new Map()

/**
 * Lỗi "phiếu đã sửa ở nơi khác", kèm tên các dòng trên máy đã bị xoá trên server và các trường đầu phiếu
 * xung đột (đã lấy theo server) nếu có.
 */
export function conflictMessage(
  {
    removed,
    headerConflicts,
  }: { removed: string[]; headerConflicts: readonly ExportHeaderField[] },
  t: TFunction,
): string {
  const parts = [t(`${P}.conflict`)]
  if (removed.length > 0) parts.push(t(`${P}.removedOnServer`, { names: names(removed, t) }))
  if (headerConflicts.length > 0) {
    const fields = headerConflicts.map((f) => t(`exportForms:fields.${f}`)).join(', ')
    parts.push(t(`${P}.headerChangedOnServer`, { fields }))
  }
  return parts.join(' ')
}

function canSaveNotice(check: Exclude<CanSave, { ok: true }>, t: TFunction): ExportNotice {
  const count = check.keys?.length ?? 0
  switch (check.reason) {
    case 'noLines':
      return new ExportNotice(t(`${P}.noLines`))
    case 'tooMany':
      return new ExportNotice(t(`${P}.tooMany`, { max: MAX_ITEMS }))
    case 'missingPrice':
    case 'badQuantity':
      return new ExportNotice(t(`${P}.${check.reason}`, { count }))
    case 'duplicate':
      return new ExportNotice(t(`${P}.duplicate`))
  }
}

/** Nội dung hộp hỏi "Lưu nháp": số dòng + tổng tiền. */
function summary(draft: ExportDraft, t: TFunction, locale: FormatLocale): string {
  const { lines } = draft
  return t(`${P}.lines`, { count: lines.length, total: formatMoney(linesTotal(lines), locale) })
}

/**
 * Phiếu Nháp của CHÍNH người dùng này có đúng mã + PO + người nhận của bản nháp phiếu mới: POST lần
 * trước đã ghi nhưng phản hồi mất. Không có → `null`.
 */
async function findOwnCreated(
  wh: string,
  draft: ExportDraft,
  userSlug: string,
): Promise<ExportForm | null> {
  const { code, purchaseOrder, receiver } = toInput(draft)
  const page = await fetchExportForms(wh, { page: 1, status: 'DRAFT', field: 'code', query: code })
  const hit = page.items.find(
    (f) =>
      f.code === code &&
      f.requesterSlug === userSlug &&
      f.purchaseOrder === purchaseOrder &&
      f.receiver === receiver,
  )
  return hit ? fetchExportForm(wh, hit.slug) : null
}

/**
 * Lưu / Gửi duyệt / Xoá nháp — mọi thao tác ghi lên server của luồng 3 bước phiếu xuất (spec
 * form-wizard §3.1, §6).
 * - Kiểm trên máy (`canSave`) trước, lỗi thì báo mức phiếu, không hỏi.
 * - Hỏi lại bằng `confirmAction` (Lưu nháp, Xoá; Gửi duyệt KHÔNG hỏi — bước 3 là bước xác nhận); cả luồng
 *   chạy trong MỘT `useGuardedAction` nên bấm đôi / bấm Lưu rồi Gửi duyệt đều chỉ một luồng.
 * - Mọi thông báo mức phiếu đi qua `useFormNotice` (thấy ở mọi bước của đúng phiếu); thông báo cũ bỏ khi
 *   thao tác thật sự bắt đầu (đồng ý ở hộp hỏi / bước 3 bấm Gửi duyệt).
 * - Mọi lần rời luồng sau khi ghi đi qua `leave` (màn truyền `exportWizardLeave(nav)`).
 * - Trong lúc gửi, store `saving` khoá mọi sửa trên máy (kết quả sẽ thay bản nháp).
 * - Lệch version (409 / mã "phiếu đã đổi"): tải lại, gộp (`mergeAfterConflict`), báo, KHÔNG gửi lại.
 *   Phiếu không còn Nháp / bị xoá → báo (hộp thoại — luồng sẽ đóng), bỏ bản nháp, về màn xem.
 * - Thiếu hàng khi gửi duyệt (101502 / 100817, backend không nói dòng nào): tải tồn + lô của các vật
 *   tư trên phiếu, mô phỏng giữ hàng (`detectShortages`) để tô từng dòng thiếu; không dò ra → câu chung.
 *   Cả hai → về bước 2.
 * - Phiên đổi giữa chừng (`getSessionEpoch`) → bỏ kết quả.
 * - Phiếu mới: Lưu / Gửi duyệt tạo phiếu trước (POST), bản nháp chuyển sang slug mới
 *   (`adoptServerForm`). Trùng mã: nếu là phiếu Nháp của chính mình (lần Lưu trước mất phản hồi) → mở lại
 *   phiếu đó (bước 2 của nó), không thì ở lại phiếu mới, `codeError` + về bước 1.
 */
export function useExportActions({
  ctx,
  form,
  abilities,
  leave,
}: ExportActionsContext & { leave: ExportLeave }): ExportActions {
  const { t, i18n } = useTranslation(['exportForms', 'errors', 'common'])
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<ExportActionKind | null>(null)
  /** Đã rời màn (gửi duyệt / xoá xong, phiếu mất): giữ khoá, không mở lại. */
  const leaving = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = async (kind: ExportActionKind) => {
    leaving.current = false
    // Chứng từ đang tải lên → Lưu nháp / Gửi duyệt bây giờ sẽ ghi phiếu thiếu file. Chặn và báo; đổi
    // bước vẫn được (lần tải chạy tiếp, xong thì gắn vào bản nháp).
    if (kind !== 'delete' && isAttachmentUploading('export')) {
      throw new ExportNotice(t('common:attachment.waitUpload'))
    }
    const store = useExportDraft.getState()
    const draft = store.draft
    if (!ctx || !draft || !abilities) return
    const sc = store.ctx
    if (sc?.warehouseSlug !== ctx.warehouseSlug || sc.formSlug !== ctx.formSlug) return
    const wh = ctx.warehouseSlug
    const isNew = ctx.formSlug === 'new'
    if (!isNew && !form) return
    // Thông báo / dấu thiếu hàng cũ chỉ bỏ khi thao tác thật sự bắt đầu (đồng ý ở hộp hỏi): bấm "Xem lại"
    // là để xem lại đúng những dấu đó. Lỗi `canSave` thì thay thông báo qua `onError` như mọi lỗi.
    const started = () => {
      useFormNotice.getState().dismiss('export', ctx.formSlug)
      useCodeTaken.getState().clear('export', ctx)
    }

    const epoch = getSessionEpoch()
    const alive = () => getSessionEpoch() === epoch
    /** Store còn đúng bản nháp của phiếu `slug` (người dùng chưa mở phiếu khác trong lúc chờ). */
    const ownsDraft = (slug: string) => {
      const c = useExportDraft.getState().ctx
      return c?.warehouseSlug === wh && c.formSlug === slug
    }
    const listKey = [...exportFormKeys.warehouse(wh), 'list']
    /**
     * Ghi phiếu server vào cache chi tiết. Huỷ lần tải đang bay trước: nó có thể đọc bản trước khi ghi
     * và về SAU, ghi đè cache bằng version cũ.
     */
    const putDetail = async (f: ExportForm) => {
      const key = exportFormKeys.detail(wh, f.slug)
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData(key, f)
    }

    /** Phiếu không còn / không còn Nháp: bỏ bản nháp, báo, về màn xem (màn sửa đóng nên dùng hộp thoại). */
    const formGone = async (slug: string) => {
      leaving.current = true
      void queryClient.invalidateQueries({ queryKey: exportFormKeys.warehouse(wh) })
      // Phiếu có thể đã được gửi duyệt / xác nhận ở nơi khác → tồn khả dụng đã đổi.
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
      haptics.error()
      Alert.alert(t(`${P}.goneTitle`), t(`${P}.gone`))
      if (mounted.current) leave.toView(slug)
      if (ownsDraft(slug)) await useExportDraft.getState().discard()
    }

    /** Lỗi "phiếu đã đổi": tải lại, gộp vào bản nháp, báo các dòng bị xoá. Không gửi lại. */
    const reloadAfterConflict = async (slug: string): Promise<void> => {
      let fresh: ExportForm
      try {
        fresh = await fetchExportForm(wh, slug)
      } catch (e) {
        if (!alive()) return
        if (isExportFormNotFoundError(e)) return formGone(slug)
        throw new ExportNotice(
          t(`${P}.conflictReloadFailed`, { error: exportFormErrorMessage(e, t) }),
        )
      }
      if (!alive()) return
      if (fresh.status !== 'DRAFT') return formGone(slug)
      const local = ownsDraft(slug) ? useExportDraft.getState().draft : null
      let result: Parameters<typeof conflictMessage>[0] = { removed: [], headerConflicts: [] }
      if (local) {
        const merged = mergeAfterConflict(local, fresh)
        useExportDraft.getState().replace(merged.draft)
        result = merged
      }
      // Sau `replace`: màn nạp lại theo version mới sẽ đọc đúng bản đã gộp (ghi nốt trước khi đọc).
      await putDetail(fresh)
      throw new ExportNotice(conflictMessage(result, t))
    }

    /**
     * Thiếu hàng khi gửi duyệt (hoặc lô đã chọn hết hàng khi Lưu — 101432): tải tồn + lô (còn hàng) của
     * các vật tư trên phiếu rồi dò dòng thiếu. Đang Lưu (không gửi duyệt) thì câu báo nói "lưu lại".
     */
    const shortageNotice = async (lines: ExportLine[]): Promise<ExportNotice> => {
      const unknown = () => new ExportNotice(t(`${P}.shortageUnknown`), NO_DETECTED, true)
      try {
        const materials = [...new Set(lines.map((l) => l.materialSlug))]
        const [stock, batches] = await Promise.all([
          fetchAllInventory(wh),
          Promise.all(materials.map((m) => fetchMaterialBatches(wh, m))),
        ])
        // "còn n" trên các dòng đọc tồn / lô từ cache → làm mới theo số vừa tải.
        void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
        const found = detectShortages(
          lines,
          new Map(stock.map((s) => [s.materialSlug, s])),
          new Map(materials.map((m, i) => [m, batches[i]!])),
        )
        // Có mặt trong map là thiếu (số thiếu theo đơn vị dòng tối thiểu 0,000001, không bao giờ 0).
        if (found.size === 0) return unknown()
        const detected = new Map<string, Detected>()
        for (const l of lines) {
          const shortage = found.get(l.key)
          if (shortage) {
            detected.set(l.key, {
              shortage,
              at: { quantity: l.quantity, unitSlug: l.unitSlug, batchSlug: l.batchSlug },
            })
          }
        }
        const key = kind === 'submit' ? `${P}.shortage` : `${P}.shortageOnSave`
        return new ExportNotice(t(key, { count: found.size }), detected)
      } catch {
        return unknown()
      }
    }

    // ---- Xoá nháp ----
    if (kind === 'delete') {
      if (isNew || !form || !abilities.canDelete) return
      const slug = form.slug
      const ok = await confirmAction({
        title: t(`${P}.deleteTitle`, { code: form.code }),
        message: t(`${P}.deleteMessage`),
        confirmLabel: t(`${P}.deleteLabel`),
        cancelLabel: t(`${P}.keep`),
        destructive: true,
      })
      if (!ok) return
      started()
      setBusy('delete')
      useExportDraft.getState().setSaving(true)
      try {
        try {
          await deleteExportForm(wh, slug)
        } catch (e) {
          if (!alive()) return
          if (isNotDraftError(e)) return await formGone(slug)
          // Đã bị xoá ở nơi khác: kết quả như xoá xong.
          if (!isExportFormNotFoundError(e)) throw e
        }
        if (!alive()) return
        leaving.current = true
        // Chỉ danh sách: chi tiết của màn xem bên dưới sẽ 404 nếu tải lại trước khi màn đóng.
        void queryClient.invalidateQueries({ queryKey: listKey })
        haptics.success()
        if (mounted.current) leave.toList()
        if (ownsDraft(slug)) await useExportDraft.getState().discard()
      } finally {
        useExportDraft.getState().setSaving(false)
        if (mounted.current && !leaving.current) setBusy(null)
      }
      return
    }

    // ---- Lưu / Gửi duyệt ----
    if (kind === 'save' ? !abilities.canEdit : !abilities.canSubmit) return
    const check = canSave(draft)
    if (!check.ok) throw canSaveNotice(check, t)
    const submitting = kind === 'submit'
    const code = draft.header.code
    // "Lưu nháp" hỏi lại; Gửi duyệt (chỉ từ bước 3 — chính bước đó là bước xác nhận) thì không.
    if (!submitting) {
      const ok = await confirmAction({
        title: t(isNew ? `${P}.createTitle` : `${P}.saveTitle`, { code }),
        message: summary(draft, t, locale),
        confirmLabel: t(isNew ? `${P}.createLabel` : `${P}.saveLabel`),
        cancelLabel: t(`${P}.review`),
      })
      if (!ok) return
    }
    started()

    /**
     * Phiếu mới đã có trên server nhưng cần người dùng xem lại (mở lại phiếu lần trước / gửi duyệt lỗi):
     * `leave.reopen` — màn xem phiếu đó lên đỉnh Stack tab, modal giữ mở ở bước 2 của phiếu đó (các bước
     * của `'new'` bỏ đi); thông báo hiện SAU khi điều hướng, cho phiếu MỚI — các bước của `'new'` rời
     * đi chỉ bỏ thông báo của `'new'`.
     */
    const openCreated = (slug: string, carry: Notice) => {
      leaving.current = true
      if (!mounted.current) return
      leave.reopen(slug)
      showNotice(carry, slug)
    }

    /**
     * Lưu đầu tiên của phiếu mới: POST. Trả phiếu đã tạo (bản nháp đã theo nó), hoặc `null` khi trùng
     * mã (ở lại, `codeError`) / phiên đổi.
     */
    const create = async (): Promise<{ form: ExportForm; recovered: boolean } | null> => {
      const newKey = exportDraftStorageKey(ctx.userSlug, wh, 'new')
      const ownsNew = () => {
        const c = useExportDraft.getState().ctx
        return c?.userSlug === ctx.userSlug && c.warehouseSlug === wh && c.formSlug === 'new'
      }
      let created: ExportForm
      let recovered = false
      try {
        created = await createExportForm(wh, toInput(draft))
      } catch (e) {
        if (!alive()) return null
        // Lô đã chọn hết hàng: chỉ ra dòng như thiếu hàng khi gửi duyệt; ở lại màn phiếu mới.
        if (isBatchOutOfStockError(e)) throw await shortageNotice(draft.lines)
        const errorCode = isApiError(e) ? e.code : undefined
        const taken = errorCode === undefined ? undefined : CODE_TAKEN[errorCode]
        if (!taken) throw e
        // Lỗi tra cứu (mạng…) → báo mức phiếu, ở lại: đừng đẩy người dùng đi đổi mã khi phiếu có thể
        // đã được tạo (đổi mã = phiếu thứ hai).
        const own =
          errorCode === CODE_EXISTS_CODE ? await findOwnCreated(wh, draft, ctx.userSlug) : null
        if (!alive()) return null
        if (!own) {
          haptics.error()
          useCodeTaken
            .getState()
            .set('export', ctx, draft.header.code, t(`exportForms:errors.${taken}`))
          // Ô Mã phiếu ở bước 1: lần Lưu bắt đầu ở bước 2 / 3 thì về đó cho thấy lỗi.
          if (mounted.current) leave.toInfo()
          return null
        }
        created = own
        recovered = true
      }
      // Phiếu đã có trên server: khoá 'new' phải mất kể cả khi phiên đã đổi / đã rời màn — không thì
      // lần Lưu sau POST lại cùng mã.
      if (!alive()) {
        void kv.remove(newKey)
        return null
      }
      if (ownsNew()) {
        const local = useExportDraft.getState().draft
        useExportDraft.getState().adoptServerForm(created)
        // Mở lại phiếu cũ: gộp như lệch version để không mất dòng / số đã thêm sau lần Lưu bị ngắt.
        if (recovered && local) {
          useExportDraft.getState().replace(mergeAfterConflict(local, created).draft)
        }
      } else void kv.remove(newKey)
      await putDetail(created)
      void queryClient.invalidateQueries({ queryKey: listKey })
      return { form: created, recovered }
    }

    setBusy(kind)
    useExportDraft.getState().setSaving(true)
    try {
      let saved: ExportForm | null = null
      if (isNew) {
        const result = await create()
        if (!result) return
        saved = result.form
        // Mở lại phiếu lần Lưu trước đã tạo: bản đã gộp có thể khác phiếu trên server → KHÔNG gửi
        // duyệt thay người dùng; sang màn sửa của phiếu đó, báo để họ xem lại rồi Lưu / Gửi duyệt.
        if (result.recovered) {
          haptics.success()
          return openCreated(saved.slug, {
            message: t(`${P}.recovered`, { code: saved.code }),
            shortages: NO_DETECTED,
          })
        }
      } else if (submitting ? isDirty(draft, form!) : true) {
        const slug = form!.slug
        await queryClient.cancelQueries({ queryKey: exportFormKeys.detail(wh, slug) })
        try {
          saved = await updateExportForm(wh, slug, {
            ...toInput(draft),
            version: draft.version ?? form!.version,
          })
        } catch (e) {
          if (!alive()) return
          if (isStaleExportFormError(e)) return await reloadAfterConflict(slug)
          if (isBatchOutOfStockError(e)) {
            const lines =
              (ownsDraft(slug) ? useExportDraft.getState().draft?.lines : null) ?? draft.lines
            throw await shortageNotice(lines)
          }
          // Mã phiếu đã sửa trùng phiếu khác / mã đang giữ: như phiếu mới — về bước 1, lỗi dưới ô Mã.
          const taken = isApiError(e) && e.code !== undefined ? CODE_TAKEN[e.code] : undefined
          if (taken) {
            haptics.error()
            useCodeTaken
              .getState()
              .set('export', ctx, draft.header.code, t(`exportForms:errors.${taken}`))
            if (mounted.current) leave.toInfo()
            return
          }
          throw e
        }
        if (!alive()) return
        if (ownsDraft(slug)) useExportDraft.getState().adoptServerForm(saved)
        await putDetail(saved)
        void queryClient.invalidateQueries({ queryKey: listKey })
      }
      const slug = saved?.slug ?? form!.slug

      if (!submitting) {
        haptics.success()
        leaving.current = true
        // Tạo phiếu mới xong → danh sách (chốt 2026-11-08); phiếu có sẵn → màn xem.
        if (mounted.current) {
          if (isNew) leave.toList()
          else leave.toView(slug)
        }
        return
      }

      let submitted: ExportForm
      try {
        submitted = await submitExportForm(
          wh,
          slug,
          saved?.version ?? draft.version ?? form!.version,
        )
      } catch (e) {
        if (!alive()) return
        let failure: ExportNotice
        if (isShortageError(e)) {
          const lines =
            (ownsDraft(slug) ? useExportDraft.getState().draft?.lines : null) ?? draft.lines
          failure = await shortageNotice(lines)
          if (!alive()) return
        } else if (saved) {
          // Đã lưu xong, chỉ bước gửi duyệt lỗi: phiếu vẫn Nháp với số đã lưu (bản nháp đã theo nó).
          failure = new ExportNotice(
            t(`${P}.savedNotSubmitted`, { error: exportFormErrorMessage(e, t) }),
          )
        } else if (isStaleExportFormError(e)) {
          return await reloadAfterConflict(slug)
        } else throw e
        // Phiếu mới vừa tạo: màn 'new' không còn bản nháp của nó → sang màn sửa của phiếu, kèm báo.
        if (isNew) {
          haptics.error()
          return openCreated(slug, { message: failure.message, shortages: failure.shortages })
        }
        throw failure
      }
      if (!alive()) return
      leaving.current = true
      await putDetail(submitted)
      void queryClient.invalidateQueries({ queryKey: exportFormKeys.warehouse(wh) })
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
      haptics.success()
      // Tạo phiếu mới rồi gửi duyệt xong → danh sách (chốt 2026-11-08); phiếu có sẵn → màn xem.
      if (mounted.current) {
        if (isNew) leave.toList()
        else leave.toView(slug)
      }
      if (ownsDraft(slug)) await useExportDraft.getState().discard()
    } finally {
      useExportDraft.getState().setSaving(false)
      // Ghi xong mà đang rời luồng: giữ `busy` tới khi màn tháo ra (nút vẫn quay, không nháy trạng thái
      // "chưa ghi" trong lúc Stack pop).
      if (mounted.current && !leaving.current) setBusy(null)
    }
  }

  const guard = useGuardedAction(run, {
    onError: (e) => {
      haptics.error()
      if (!ctx) return
      const notice =
        e instanceof ExportNotice
          ? { message: e.message, shortages: e.shortages }
          : { message: exportFormErrorMessage(e, t), shortages: NO_DETECTED }
      showNotice(notice, ctx.formSlug)
      // Thiếu hàng → bước 2 (spec §6): dò ra dòng thì thẻ thiếu được tô ở đó; không dò ra thì chỉ có câu
      // chung — vẫn về bước 2, nơi sửa được số lượng / lô. Bước 2 vẫn gắn trong lúc đổi bước nên thông
      // báo còn nguyên.
      if (e instanceof ExportNotice && e.shortage && mounted.current) leave.toItems()
    },
  })

  const start = async (kind: ExportActionKind) => {
    const ran = await guard.run(kind)
    // Thành công mà vẫn ở màn (Lưu xong, huỷ hộp hỏi, phiên đổi) → mở khoá cho lần sau.
    if (ran && !leaving.current && mounted.current) guard.reset()
  }

  const code = useExportDraft((s) => s.draft?.header.code)
  const codeError = useCodeTakenMessage('export', ctx, code)

  return {
    save: () => start('save'),
    submit: () => start('submit'),
    remove: () => start('delete'),
    busy,
    codeError,
  }
}
