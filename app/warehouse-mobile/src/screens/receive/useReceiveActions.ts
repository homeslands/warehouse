import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import type { TFunction } from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import {
  confirmImportForm,
  createImportForm,
  deleteImportForm,
  fetchImportForm,
  fetchImportForms,
  importFormErrorMessage,
  importFormKeys,
  isImportFormNotFoundError,
  isStaleImportFormError,
  updateImportForm,
  type ImportForm,
} from '@/entities/import-form'
import { inventoryKeys } from '@/entities/inventory'
import { isAttachmentUploading } from '@/features/form-attachment'
import { getSessionEpoch, useAuthStore } from '@/entities/session'
import {
  buildSummary,
  canSave,
  draftStorageKey,
  isDirty,
  mergeAfterConflict,
  progress,
  RECEIVE_CHECKLIST_ENABLED,
  toCreateInput,
  toUpdateInput,
  dropLocalDraft,
  useReceiveDraft,
  type CanSave,
  type DraftContext,
  type ImportHeaderField,
  type ReceiveDraft,
  type Summary,
  type SummaryChange,
} from '@/features/receive-checklist'
import { ERROR_CODE_KEYS } from '@/shared/api/error-codes'
import { isApiError } from '@/shared/api/http'
import { useCodeTaken, useCodeTakenMessage } from '@/shared/lib/code-taken.store'
import { useFormNotice } from '@/shared/lib/form-notice.store'
import {
  formatMoney,
  formatQuantity,
  formatShortDate,
  type FormatLocale,
} from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'
import type { WizardNav } from '@/shared/lib/useWizardNav'
import { kv } from '@/shared/storage/kv'

export type ReceiveActionKind = 'save' | 'confirm' | 'delete'

/**
 * Điều hướng sau một lần ghi của luồng soạn 3 bước — màn bước truyền từ `nav` của luồng
 * (`importWizardLeave`), để MỌI lần rời luồng đi qua `useWizardNav` (không route bước nào còn nằm dưới
 * màn xem).
 */
export type ReceiveLeave = {
  /** Ghi xong (phiếu có sẵn) → màn xem phiếu `slug` (bỏ mọi bước của phiếu). */
  toView: (slug: string) => void
  /** Tạo phiếu mới xong → danh sách phiếu (bỏ mọi bước của `'new'`) — chốt 2026-11-08. */
  toList: () => void
  /** Trùng mã → bước 1 (lỗi dưới ô Mã phiếu). */
  toInfo: () => void
  /** Mở lại phiếu lần trước → màn xem `slug` dưới (trong tab), modal ở bước 2 của `slug`. */
  reopen: (slug: string) => void
}

/** `leave` của các màn bước phiếu nhập, theo `nav` của `useImportWizardDraft`. */
export function importWizardLeave(nav: WizardNav): ReceiveLeave {
  return {
    toView: nav.finish,
    toList: nav.finishToList,
    toInfo: () => nav.goToStep(1),
    reopen: nav.reopen,
  }
}

export type ReceiveActionsContext = {
  warehouseSlug: string | undefined
  /** Phiếu trên server lúc này (cache `useImportForm`): so `isDirty`, lấy mã phiếu. */
  form: ImportForm | undefined
  /**
   * `importFormAbilities(...).canEdit`. Không có quyền sửa thì KHÔNG bao giờ PATCH (sẽ ăn 403 / 101315
   * rồi rơi vào vòng "phiếu đã đổi"): bản nháp có thay đổi → báo mức phiếu, gợi ý bỏ thay đổi.
   */
  canEdit: boolean
  /**
   * Màn đang là checklist (`receiveMode` 'check', mặc định). `false` (luồng soạn) → câu báo lệch
   * version không nói "kiểm lại" (người dùng không có dấu kiểm).
   */
  checklist?: boolean
} & (
  | {
      /** Checklist Kiểm hàng: thông báo là state của hook, Lưu xong ở lại, Xác nhận xong `back()`. */
      compose?: false
      leave?: undefined
      isNew?: undefined
    }
  | {
      /**
       * Luồng soạn 3 bước (`/import-form/[formSlug]/info|edit|review`): dòng số 0 là "chưa nhập" (`canSave`
       * `zeroIsMissing`); mọi thông báo qua `useFormNotice` (`kind: 'import'`); mọi lần rời / đổi bước
       * sau ghi qua `leave`.
       */
      compose: true
      leave: ReceiveLeave
      /** Phiếu mới chưa có trên server (`'new'`): Lưu = `POST` tạo phiếu nháp. */
      isNew?: boolean
    }
)

export type ReceiveActions = {
  /**
   * PATCH (phiếu mới: POST); không đổi trạng thái phiếu. Checklist: hỏi lại kèm tóm tắt. Luồng soạn
   * ("Lưu nháp" ở bước 3): KHÔNG hỏi — chính bước đó là bước xem lại (spec form-wizard §6).
   */
  save: () => Promise<void>
  /**
   * Hỏi lại (cảnh báo cộng tồn ngay) rồi PATCH (nếu có thay đổi) → `POST …/confirm`. Phiếu mới (luồng
   * soạn): POST tạo → `POST …/confirm`. Checklist xong → `back()`; luồng soạn ("Lưu & xác nhận" ở bước 3,
   * chốt 2026-11-08, như web) xong → `leave.toView`. Luồng soạn KHÔNG đòi dấu đã kiểm.
   */
  confirm: () => Promise<void>
  /**
   * Xoá phiếu nháp (chỉ luồng soạn, phiếu đã có, `canDelete` do menu kiểm): hỏi lại (kèm câu nhắc nếu
   * trên máy còn bản nháp dở) → `DELETE` (404 = như xoá xong) → làm mới danh sách → `leave.toList()` →
   * bỏ bản nháp của phiếu. Không còn Nháp (101314) → như "phiếu không còn" (`leave.toView`).
   */
  remove: () => Promise<void>
  /**
   * Đang gửi request nào từ màn này (cả Lưu lẫn Xác nhận đều khoá khi khác `null`). Luồng soạn ghi xong
   * mà rời luồng (`leave`) → giữ nguyên tới khi màn tháo ra.
   */
  busy: ReceiveActionKind | null
  /** Thông báo mức phiếu của lần gần nhất (đã dịch) — CHỈ checklist; luồng soạn: luôn `null`. */
  error: string | null
  /** Dòng cần tô (vd hạn dùng trước ngày phiếu) — chỉ checklist. */
  flagged: ReadonlySet<string>
  /** Thông báo hiện tại nên kèm nút "Bỏ thay đổi trên máy" (thay đổi trên máy không lưu được). */
  offerDiscard: boolean
  dismissError: () => void
  /**
   * Server báo trùng mã phiếu (101304 / 101305, đã dịch) — báo dưới ô Mã phiếu ở bước 1. Store cấp
   * module theo (người dùng, kho, phiếu): dùng chung mọi bước (lần Lưu bắt đầu ở bước 3 rồi về bước 1).
   * Mất khi mã trong bản nháp đổi.
   */
  codeError: string | null
}

/** Hộp hỏi phải đọc được cả khi phiếu 200 dòng: liệt kê tối đa bấy nhiêu dòng mỗi nhóm. */
const SUMMARY_MAX_LINES = 8
/** `IMPORT_FORM_ITEMS_MAX` của backend (cùng giá trị `MAX_ITEMS` của feature). */
const ITEMS_MAX = 200
/** Mã phiếu trùng / đã dùng cho phiếu đã xoá → ở lại màn soạn, báo dưới ô mã. */
const CODE_TAKEN_CODES: readonly number[] = [101304, 101305]
/** Mã phiếu đã tồn tại (có thể chính là phiếu lần Lưu trước đã tạo nhưng mất phản hồi). */
const CODE_EXISTS_CODE = 101304

/** `importFormNotDraft`: phiếu không còn ở trạng thái Nháp. */
const NOT_DRAFT_CODE = 101314

const NO_KEYS: ReadonlySet<string> = new Set()

/** Lỗi đã xử lý xong, chỉ còn hiện câu báo (đã dịch) — `onError` của `useGuardedAction` nhận. */
class ReceiveNotice extends Error {
  constructor(
    message: string,
    readonly keys: readonly string[] = [],
    readonly offerDiscard = false,
  ) {
    super(message)
  }
}

const P = 'importForms:receive.actions'

/** Danh sách tên gọn: tối đa `SUMMARY_MAX_LINES`, còn lại gộp "… và n dòng khác". */
function names(list: string[], t: TFunction): string {
  const shown = list.slice(0, SUMMARY_MAX_LINES).join(', ')
  const rest = list.length - SUMMARY_MAX_LINES
  return rest > 0 ? t(`${P}.namesMore`, { names: shown, n: rest }) : shown
}

/** Nhãn trường đầu phiếu — dùng lại nhãn ô của màn tạo phiếu. */
const HEADER_FIELD_LABEL: Record<ImportHeaderField, string> = {
  code: 'importForms:fieldCode',
  invoiceCode: 'importForms:fieldInvoiceCode',
  date: 'importForms:fieldDate',
  purchaseOrder: 'importForms:fieldPurchaseOrder',
  note: 'importForms:fieldNote',
  file: 'importForms:fieldFile',
}

/**
 * Lỗi "phiếu đã đổi" mức phiếu, kèm tên các dòng trên máy đã bị xoá trên server và các trường đầu
 * phiếu xung đột (đã lấy theo server) nếu có. `checklist: false` ("Sửa phiếu"): câu không nhắc việc
 * kiểm lại.
 */
export function conflictMessage(
  removed: string[],
  t: TFunction,
  {
    checklist = true,
    headerConflicts = [],
  }: { checklist?: boolean; headerConflicts?: readonly ImportHeaderField[] } = {},
): string {
  const parts = [t(checklist ? `${P}.conflict` : `${P}.conflictEdit`)]
  if (removed.length > 0) parts.push(t(`${P}.removedOnServer`, { names: names(removed, t) }))
  if (headerConflicts.length > 0) {
    const fields = headerConflicts.map((f) => t(HEADER_FIELD_LABEL[f])).join(', ')
    parts.push(t(`${P}.headerConflict`, { fields }))
  }
  return parts.join(' ')
}

/**
 * Một dòng của hộp hỏi cho một thay đổi: số cũ → mới, dòng thêm, đổi đơn vị (mỗi bên đơn vị của nó),
 * đơn giá cũ → mới, hạn dùng cũ → mới, ghi chú đổi.
 */
function changeLine(c: SummaryChange, t: TFunction, locale: FormatLocale): string {
  const qty = (n: number) => formatQuantity(n, locale, 6)
  const day = (d: string | null) =>
    d === null ? t('importForms:receive.line.expiryEmpty') : formatShortDate(d)
  switch (c.kind) {
    case 'qty':
      return c.from === null
        ? t(`${P}.added`, { name: c.name, to: qty(c.to), unit: c.unit })
        : t(`${P}.diff`, { name: c.name, from: qty(c.from), to: qty(c.to), unit: c.unit })
    case 'unit': {
      const side = (v: { quantity: number; unit: string }) => `${qty(v.quantity)} ${v.unit}`.trim()
      return t(`${P}.unitDiff`, { name: c.name, from: side(c.from), to: side(c.to) })
    }
    case 'price':
      return t(`${P}.price`, {
        name: c.name,
        from: formatMoney(c.from, locale),
        to: formatMoney(c.to, locale),
      })
    case 'expiry':
      return t(`${P}.expiry`, { name: c.name, from: day(c.from), to: day(c.to) })
    case 'note':
      return t(`${P}.note`, { name: c.name })
  }
}

/**
 * Tóm tắt trong hộp hỏi Lưu / Xác nhận của checklist: trường đầu phiếu đã sửa, giữ nguyên, từng thay đổi (số / đơn vị / giá / hạn
 * dùng / ghi chú, tối đa `SUMMARY_MAX_LINES` mục rồi "… và n dòng khác"), dòng bị bỏ (số 0 và dòng đã
 * xoá trên máy, tên gộp như trên), tổng tiền, cảnh báo ghi đè.
 */
export function summaryLines(s: Summary, t: TFunction, locale: FormatLocale): string[] {
  const out: string[] = []
  if (s.header.length > 0) {
    const fields = s.header.map((f) => t(HEADER_FIELD_LABEL[f])).join(', ')
    out.push(t(`${P}.headerChanged`, { fields }))
  }
  const checklist = RECEIVE_CHECKLIST_ENABLED
  if (s.matched > 0) out.push(t(checklist ? `${P}.kept` : `${P}.keptReview`, { n: s.matched }))
  for (const c of s.changes.slice(0, SUMMARY_MAX_LINES)) out.push(changeLine(c, t, locale))
  if (s.changes.length > SUMMARY_MAX_LINES) {
    out.push(t(`${P}.more`, { n: s.changes.length - SUMMARY_MAX_LINES }))
  }
  const gone = [...s.dropped, ...s.removed].map((d) => d.name)
  if (gone.length > 0) out.push(t(`${P}.dropped`, { names: names(gone, t) }))
  out.push(t(`${P}.total`, { total: formatMoney(s.total, locale) }))
  // Giá / hạn dùng / ghi chú / đầu phiếu đã nêu ở trên — không phải ghi đè "số trên phiếu".
  const qtyChanged = s.changes.some((c) => c.kind === 'qty' || c.kind === 'unit')
  if (qtyChanged || gone.length > 0) {
    out.push(t(checklist ? `${P}.overwrite` : `${P}.overwriteReview`))
  }
  return out
}

function canSaveNotice(check: Exclude<CanSave, { ok: true }>, t: TFunction): ReceiveNotice {
  switch (check.reason) {
    case 'allZero':
      return new ReceiveNotice(t(`${P}.allZero`))
    case 'noLines':
      return new ReceiveNotice(t(`${P}.noLines`))
    case 'missingQuantity':
      return new ReceiveNotice(
        t(`${P}.missingQuantity`, { n: check.keys?.length ?? 0 }),
        check.keys ?? [],
      )
    case 'tooMany':
      return new ReceiveNotice(t(`${P}.tooMany`, { max: ITEMS_MAX }))
    case 'expiryBeforeDate':
      return new ReceiveNotice(
        t(`${P}.expiryBeforeDate`, { n: check.keys?.length ?? 0 }),
        check.keys ?? [],
      )
  }
}

/**
 * Phiếu Nháp của CHÍNH người dùng này có đúng mã + số hoá đơn của bản nháp phiếu mới: POST lần trước
 * đã ghi nhưng phản hồi mất (mạng rớt, app bị tắt, phiên đổi). Không có → `null`.
 */
async function findOwnCreated(
  wh: string,
  draft: ReceiveDraft,
  userSlug: string,
): Promise<ImportForm | null> {
  const { code, invoiceCode } = draft.header
  const page = await fetchImportForms(wh, { page: 1, status: 'DRAFT', field: 'code', query: code })
  const hit = page.items.find(
    (f) => f.code === code && f.requesterSlug === userSlug && f.invoiceCode === invoiceCode,
  )
  return hit ? fetchImportForm(wh, hit.slug) : null
}

/**
 * Lưu / Xác nhận nhập kho — hai thao tác DUY NHẤT ghi lên server của phiếu nhập: checklist Kiểm hàng
 * (spec §5.3, §6.2) và luồng soạn 3 bước (`compose`, spec form-wizard §6).
 * - Kiểm trên máy (`canSave`) trước, lỗi thì báo mức phiếu, không hỏi.
 * - Checklist hỏi lại bằng `confirmAction` kèm tóm tắt; luồng soạn KHÔNG hỏi (chỉ bước 3 ghi — chính
 *   bước đó là bước xác nhận). Cả luồng chạy trong MỘT `useGuardedAction` nên bấm đôi hay bấm Lưu rồi
 *   Xác nhận đều chỉ một luồng.
 * - Trong lúc gửi, store `saving` khoá mọi sửa trên máy (kết quả sẽ thay bản nháp).
 * - Lệch version / phiếu không còn sửa được: tải lại, gộp (`mergeAfterConflict`), KHÔNG gửi lại. Phiếu
 *   không còn Nháp / bị xoá → hộp thoại, bỏ bản nháp, về màn xem.
 * - Phiên đổi giữa chừng (`getSessionEpoch`) → bỏ kết quả.
 * - Trùng mã (101304 / 101305) → `codeError` (store cấp module); luồng soạn còn `leave.toInfo()`,
 *   checklist (không có ô Mã phiếu) còn báo mức phiếu như mọi lỗi khác.
 *
 * Checklist (không `compose`): thông báo là state của hook (`error` / `flagged` / `offerDiscard`), Lưu
 * xong ở lại màn, Xác nhận xong / phiếu mất → `router.back()` về màn xem.
 *
 * Luồng soạn (`compose`):
 * - Mọi thông báo mức phiếu qua `useFormNotice` (`kind: 'import'`, thấy ở mọi bước của phiếu); thông
 *   báo cũ (và `codeError`) bỏ khi thao tác THẬT SỰ bắt đầu (bấm Lưu ở bước 3).
 * - Mọi lần rời / đổi bước sau ghi qua `leave` (màn truyền `importWizardLeave(nav)`).
 * - Phiếu mới: Lưu = `POST` tạo phiếu nháp → bản nháp chuyển sang slug mới (`adoptServerForm`) →
 *   `leave.toList()`. Trùng mã 101304 mà là phiếu Nháp của chính mình cùng mã + số HĐ (lần Lưu
 *   trước đã tạo nhưng mất phản hồi) → mở lại phiếu đó (gộp): `leave.reopen(slug)` (màn xem dưới, modal
 *   ở bước 2 của nó), báo "đã mở lại" cho slug MỚI SAU khi điều hướng; không thì ở lại, `codeError` +
 *   `leave.toInfo()`.
 * - Phiếu đã có: Lưu = PATCH → `leave.toView(slug)`; đổi mã trùng → `codeError` + `leave.toInfo()`.
 */
export function useReceiveActions(context: ReceiveActionsContext): ReceiveActions {
  const { warehouseSlug, form, canEdit, checklist = true } = context
  const leave = context.compose ? context.leave : undefined
  const compose = !!leave
  const isNew = context.compose ? !!context.isNew : false
  /** Phiếu của màn (`'new'` = phiếu mới) — khoá của thông báo mức phiếu / `codeError`. */
  const formSlug = isNew ? 'new' : form?.slug
  const { t, i18n } = useTranslation(['importForms', 'errors', 'common'])
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const router = useRouter()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<ReceiveActionKind | null>(null)
  /** 101304 / 101305 → câu đã dịch; mã khác → `null`. */
  const codeTakenMessage = (e: unknown): string | null => {
    if (!isApiError(e) || e.code === undefined || !CODE_TAKEN_CODES.includes(e.code)) return null
    const key = ERROR_CODE_KEYS[e.code]
    return key ? t(`errors:${key}`) : null
  }
  /** Thông báo của checklist (luồng soạn dùng `useFormNotice`, không bao giờ đặt state này). */
  const [notice, setNotice] = useState<{
    message: string
    keys: ReadonlySet<string>
    offerDiscard: boolean
  } | null>(null)
  /** Đã rời màn (xác nhận / lưu xong, phiếu mất): giữ khoá, không mở lại. */
  const leaving = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * Thao tác thật sự bắt đầu (đồng ý ở hộp hỏi / Lưu ở bước 3): bỏ thông báo mức phiếu cũ của luồng
   * soạn và `codeError` của bản nháp `c`.
   */
  const started = (slug: string, c: DraftContext | null) => {
    if (compose) useFormNotice.getState().dismiss('import', slug)
    if (c) useCodeTaken.getState().clear('import', c)
  }

  /**
   * Lưu đầu tiên của phiếu mới (chỉ luồng soạn): tạo phiếu nháp trên server. `confirm`: hỏi lại TRƯỚC khi
   * ghi gì, tạo xong thì xác nhận luôn phiếu vừa tạo; xác nhận lỗi → phiếu vẫn là Nháp, về màn xem kèm
   * thông báo "đã lưu nhưng chưa xác nhận". Mở lại phiếu lần trước (mất phản hồi) thì KHÔNG xác nhận —
   * bản trên máy vừa gộp, người dùng phải xem lại.
   */
  const create = async (kind: ReceiveActionKind) => {
    const draft = useReceiveDraft.getState().draft
    const startCtx = useReceiveDraft.getState().ctx
    if (
      !leave ||
      !warehouseSlug ||
      !draft ||
      draft.formSlug !== 'new' ||
      startCtx?.formSlug !== 'new'
    ) {
      return
    }
    const wh = warehouseSlug

    // Phiếu mới chỉ tạo từ luồng soạn: dòng số 0 là "chưa nhập".
    const check = canSave(draft, { zeroIsMissing: true })
    if (!check.ok) throw canSaveNotice(check, t)

    if (kind === 'confirm') {
      const ok = await confirmAction({
        title: t(`${P}.confirmTitle`, { code: draft.header.code }),
        message: t(`${P}.confirmWarning`),
        confirmLabel: t(`${P}.confirmLabel`),
        cancelLabel: t(`${P}.review`),
      })
      if (!ok) return
    }

    started('new', startCtx)

    const epoch = getSessionEpoch()
    const alive = () => getSessionEpoch() === epoch
    const ownsNew = () => {
      const c = useReceiveDraft.getState().ctx
      return c?.userSlug === startCtx.userSlug && c.warehouseSlug === wh && c.formSlug === 'new'
    }

    const newKey = draftStorageKey(startCtx.userSlug, wh, 'new')
    setBusy(kind)
    useReceiveDraft.getState().setSaving(true)
    try {
      let created: ImportForm
      /** Không tạo mới mà mở lại phiếu lần Lưu trước đã tạo (mất phản hồi). */
      let recovered = false
      try {
        created = await createImportForm(wh, toCreateInput(draft))
      } catch (e) {
        if (!alive()) return
        if (!(isApiError(e) && e.code !== undefined && CODE_TAKEN_CODES.includes(e.code))) throw e
        // Lỗi tra cứu (mạng…) → báo mức phiếu, ở lại: đừng đẩy người dùng đi đổi mã khi phiếu có thể
        // đã được tạo (đổi mã = phiếu thứ hai, cộng kho hai lần nếu xác nhận cả hai).
        const own =
          e.code === CODE_EXISTS_CODE ? await findOwnCreated(wh, draft, startCtx.userSlug) : null
        if (!alive()) return
        if (!own) {
          haptics.error()
          const message = codeTakenMessage(e)
          if (message) {
            useCodeTaken.getState().set('import', startCtx, draft.header.code, message)
          }
          // Ô Mã phiếu ở bước 1: lần Lưu bắt đầu ở bước 3 thì về đó cho thấy lỗi.
          if (mounted.current) leave.toInfo()
          return
        }
        created = own
        recovered = true
      }
      // Phiếu đã có trên server: khoá 'new' (theo người dùng) phải mất kể cả khi phiên đã đổi hay người
      // dùng đã rời màn — không thì lần Lưu sau POST lại cùng mã.
      if (!alive()) {
        void kv.remove(newKey)
        return
      }
      if (ownsNew()) {
        const local = useReceiveDraft.getState().draft
        // adopt: khoá 'new' → slug, giữ dấu kiểm. Mở lại phiếu cũ: gộp như lệch version để không mất
        // dòng / số đã thêm sau lần Lưu bị ngắt (dòng khác server → kiểm lại).
        useReceiveDraft.getState().adoptServerForm(created)
        if (recovered && local) {
          useReceiveDraft.getState().replace(mergeAfterConflict(local, created).draft)
        }
      } else void kv.remove(newKey)
      queryClient.setQueryData(importFormKeys.detail(wh, created.slug), created)
      void queryClient.invalidateQueries({ queryKey: [...importFormKeys.warehouse(wh), 'list'] })

      // "Lưu & xác nhận": xác nhận phiếu vừa tạo (không áp cho phiếu mở lại — xem trên).
      let confirmError: string | null = null
      let confirmed = false
      if (kind === 'confirm' && !recovered) {
        try {
          const done = await confirmImportForm(wh, created.slug, created.version)
          if (!alive()) return
          confirmed = true
          queryClient.setQueryData(importFormKeys.detail(wh, created.slug), done)
          void queryClient.invalidateQueries({ queryKey: importFormKeys.warehouse(wh) })
          void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
        } catch (e) {
          if (!alive()) return
          // Không biết chắc kết quả (vd hết giờ chờ mà server đã ghi) → tải lại phiếu + tồn kho.
          void queryClient.invalidateQueries({ queryKey: importFormKeys.warehouse(wh) })
          void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
          confirmError = t(`${P}.savedNotConfirmed`, { error: importFormErrorMessage(e, t) })
        }
      }

      if (confirmError) haptics.error()
      else haptics.success()
      leaving.current = true
      // Phiếu đã xác nhận: bản nháp trên máy (đã chuyển sang slug mới) không còn dùng — bỏ SAU khi rời
      // màn (bỏ trước thì màn bước của 'new' thấy mất bản nháp và nạp bản trắng).
      const dropConfirmedDraft = () => {
        const c = useReceiveDraft.getState().ctx
        if (confirmed && c?.warehouseSlug === wh && c.formSlug === created.slug) {
          void useReceiveDraft.getState().discard()
        }
      }
      // Phiếu đã tạo (Nháp) nhưng chưa xác nhận: hộp thoại gốc — màn xem không hiện thông báo mức phiếu, và
      // người dùng không được tưởng đã nhập kho. Hiện cả khi màn đã tháo ra.
      if (confirmError) Alert.alert(t(`${P}.notConfirmedTitle`), confirmError)
      if (!mounted.current) {
        dropConfirmedDraft()
        return
      }
      // Tạo xong → danh sách phiếu (phiếu mới ở đầu; mọi bước của 'new' bỏ đi). Mở lại phiếu lần trước
      // (đã gộp phần trên máy) → màn xem phiếu đó dưới, modal ở bước 2 của nó để xem lại rồi Lưu; thông
      // báo hiện SAU khi điều hướng, cho phiếu MỚI — các bước của 'new' rời đi chỉ bỏ thông báo của 'new'.
      if (recovered) leave.reopen(created.slug)
      else leave.toList()
      dropConfirmedDraft()
      if (recovered) {
        useFormNotice.getState().show({
          kind: 'import',
          formSlug: created.slug,
          // "Lưu & xác nhận" mà rơi vào phiếu mở lại: KHÔNG xác nhận (bản trên máy vừa gộp) — nói rõ.
          message: t(kind === 'confirm' ? `${P}.recoveredNotConfirmed` : `${P}.recovered`, {
            code: created.code,
          }),
        })
      }
    } finally {
      useReceiveDraft.getState().setSaving(false)
      if (mounted.current && !leaving.current) setBusy(null)
    }
  }

  /** Xoá phiếu nháp đã có trên server (chỉ luồng soạn). */
  const removeForm = async () => {
    if (!leave || isNew || !warehouseSlug || !form) return
    const wh = warehouseSlug
    const slug = form.slug
    const store = useReceiveDraft.getState()
    const userSlug = store.ctx?.userSlug ?? useAuthStore.getState().user?.userSlug ?? null
    const dctx: DraftContext | null = userSlug
      ? { userSlug, warehouseSlug: wh, formSlug: slug }
      : null
    // Câu nhắc khi form đang có thay đổi chưa lưu (bản nháp của chính phiếu này trong store).
    const dirty =
      store.ctx?.warehouseSlug === wh &&
      store.ctx.formSlug === slug &&
      !!store.draft &&
      isDirty(store.draft, form)
    const note = dirty ? `\n\n${t('importForms:manage.discardLocalNote')}` : ''
    const ok = await confirmAction({
      title: t('importForms:manage.deleteTitle', { code: form.code }),
      message: t('importForms:manage.deleteMessage', { code: form.code }) + note,
      confirmLabel: t('importForms:manage.deleteLabel'),
      cancelLabel: t('importForms:manage.deleteKeep'),
      destructive: true,
    })
    if (!ok) return
    started(slug, store.ctx?.formSlug === slug ? store.ctx : null)

    const epoch = getSessionEpoch()
    const alive = () => getSessionEpoch() === epoch
    const ownsDraft = () => {
      const c = useReceiveDraft.getState().ctx
      return c?.warehouseSlug === wh && c.formSlug === slug
    }
    setBusy('delete')
    useReceiveDraft.getState().setSaving(true)
    try {
      try {
        await deleteImportForm(wh, slug)
      } catch (e) {
        if (!alive()) return
        if (isApiError(e) && e.code === NOT_DRAFT_CODE) {
          // Không còn Nháp (xác nhận / huỷ ở nơi khác): tải lại, báo, về màn xem, bỏ bản nháp.
          leaving.current = true
          void queryClient.invalidateQueries({ queryKey: importFormKeys.warehouse(wh) })
          void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
          haptics.error()
          Alert.alert(t(`${P}.conflictTitle`), t(`${P}.gone`))
          if (mounted.current) leave.toView(slug)
          useReceiveDraft.getState().setSaving(false)
          if (dctx) await dropLocalDraft(dctx)
          return
        }
        // Đã bị xoá ở nơi khác: kết quả như xoá xong.
        if (!isImportFormNotFoundError(e)) throw e
      }
      if (!alive()) return
      leaving.current = true
      // Chỉ danh sách: chi tiết của màn xem bên dưới sẽ 404 nếu tải lại trước khi màn đóng.
      void queryClient.invalidateQueries({ queryKey: [...importFormKeys.warehouse(wh), 'list'] })
      haptics.success()
      if (mounted.current) leave.toList()
      // Sau khi rời màn (không kéo GET chi tiết → 404): bỏ cache chi tiết như màn xem.
      queryClient.removeQueries({ queryKey: importFormKeys.detail(wh, slug), exact: true })
      // Mở khoá `saving` trước: `dropLocalDraft` không bỏ bản trong bộ nhớ khi đang ghi.
      useReceiveDraft.getState().setSaving(false)
      if (ownsDraft()) await useReceiveDraft.getState().discard()
      else if (dctx) await dropLocalDraft(dctx)
    } finally {
      useReceiveDraft.getState().setSaving(false)
      if (mounted.current && !leaving.current) setBusy(null)
    }
  }

  const run = async (kind: ReceiveActionKind) => {
    leaving.current = false
    if (kind === 'delete') return removeForm()
    // Luồng soạn: chứng từ đang tải lên → Lưu / Lưu & xác nhận bây giờ sẽ ghi phiếu thiếu file. Chặn và
    // báo; đổi bước vẫn được (lần tải chạy tiếp, xong thì gắn vào bản nháp).
    if (compose && isAttachmentUploading('import')) {
      throw new ReceiveNotice(t('common:attachment.waitUpload'))
    }
    // Phiếu mới: Lưu nháp = tạo; Lưu & xác nhận = tạo rồi xác nhận.
    if (isNew) return create(kind)
    const draft = useReceiveDraft.getState().draft
    const runCtx = useReceiveDraft.getState().ctx
    const slug = form?.slug
    if (!warehouseSlug || !form || !slug || !draft || draft.formSlug !== slug) return
    const wh = warehouseSlug
    if (!compose) setNotice(null)

    // Checklist: nút Xác nhận đã khoá khi còn dòng chưa kiểm; chặn cả ở đây (spec §2 "không được xảy
    // ra"). Luồng soạn không có dấu kiểm ("Lưu & xác nhận" như web).
    const { unchecked } = progress(draft.lines)
    // Cờ `RECEIVE_CHECKLIST_ENABLED` tắt (tạm): không đòi kiểm đủ — vẫn hỏi lại ở bước dưới.
    if (RECEIVE_CHECKLIST_ENABLED && !compose && kind === 'confirm' && unchecked > 0) {
      throw new ReceiveNotice(
        t(`${P}.unchecked`, { n: unchecked }),
        draft.lines.filter((l) => !l.checked).map((l) => l.key),
      )
    }

    const patching = kind === 'save' || isDirty(draft, form)
    // Không có quyền sửa: không gửi PATCH nào (403). Thay đổi trên máy chỉ có thể bỏ đi.
    if (patching && !canEdit) throw new ReceiveNotice(t(`${P}.noEditPermission`), [], true)

    const check = canSave(draft, { zeroIsMissing: compose, addedZeroIsMissing: !compose })
    if (!check.ok) throw canSaveNotice(check, t)

    // Checklist hỏi lại kèm tóm tắt. Luồng soạn: "Lưu nháp" không hỏi (bước 3 là bước xem lại); "Lưu &
    // xác nhận" vẫn hỏi — cộng tồn ngay, không quay lại được.
    if (!compose || kind === 'confirm') {
      const summary = summaryLines(buildSummary(draft, form), t, locale)
      const ok = await confirmAction({
        title: t(kind === 'save' ? `${P}.saveTitle` : `${P}.confirmTitle`, { code: form.code }),
        message: (kind === 'save' ? summary : [t(`${P}.confirmWarning`), ...summary]).join('\n'),
        confirmLabel: t(kind === 'save' ? `${P}.saveLabel` : `${P}.confirmLabel`),
        cancelLabel: t(`${P}.review`),
      })
      if (!ok) return
    }
    started(slug, runCtx)

    const epoch = getSessionEpoch()
    const alive = () => getSessionEpoch() === epoch
    /** Store còn đúng phiếu này (người dùng chưa mở phiếu khác trong lúc chờ). */
    const ownsDraft = () => {
      const c = useReceiveDraft.getState().ctx
      return c?.warehouseSlug === wh && c.formSlug === slug
    }
    const detailKey = importFormKeys.detail(wh, slug)
    /**
     * Ghi phiếu server vào cache chi tiết. Huỷ lần tải đang bay trước: nó có thể đọc bản trước PATCH
     * và về SAU, ghi đè cache bằng version cũ.
     */
    const putDetail = async (f: ImportForm) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      queryClient.setQueryData(detailKey, f)
    }

    /**
     * Phiếu không còn / không còn Nháp: bỏ bản nháp, báo (hộp thoại — màn sẽ đóng), về màn xem phiếu
     * (luồng soạn: `leave.toView`; checklist: `back()`). Phiếu bị xoá → màn xem báo lỗi tải; không còn
     * Nháp → màn xem hiện phiếu, không có nút Kiểm hàng.
     */
    const formGone = async () => {
      leaving.current = true
      void queryClient.invalidateQueries({ queryKey: importFormKeys.warehouse(wh) })
      // Phiếu có thể đã được xác nhận ở nơi khác → tồn kho đã đổi.
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
      haptics.error()
      Alert.alert(t(`${P}.conflictTitle`), t(`${P}.gone`))
      if (mounted.current) {
        if (leave) leave.toView(slug)
        else router.back()
      }
      if (ownsDraft()) await useReceiveDraft.getState().discard()
    }

    /** Lỗi "phiếu đã đổi": tải lại, gộp vào bản nháp, báo các dòng bị xoá. Không gửi lại. */
    const reloadAfterConflict = async (): Promise<void> => {
      let fresh: ImportForm
      try {
        fresh = await fetchImportForm(wh, slug)
      } catch (e) {
        if (!alive()) return
        if (isImportFormNotFoundError(e)) return formGone()
        throw new ReceiveNotice(
          t(`${P}.conflictReloadFailed`, { error: importFormErrorMessage(e, t) }),
        )
      }
      if (!alive()) return
      if (fresh.status !== 'DRAFT') return formGone()
      const local = ownsDraft() ? useReceiveDraft.getState().draft : null
      let removed: string[] = []
      let headerConflicts: ImportHeaderField[] = []
      if (local) {
        const merged = mergeAfterConflict(local, fresh)
        useReceiveDraft.getState().replace(merged.draft)
        ;({ removed, headerConflicts } = merged)
      }
      const message = conflictMessage(removed, t, { checklist, headerConflicts })
      // Sau `replace`: màn nạp lại theo version mới sẽ đọc đúng bản đã gộp (ghi nốt trước khi đọc).
      await putDetail(fresh)
      throw new ReceiveNotice(message)
    }

    setBusy(kind)
    useReceiveDraft.getState().setSaving(true)
    try {
      // Lần tải đang bay lúc bắt đầu gửi không được về giữa chừng.
      await queryClient.cancelQueries({ queryKey: detailKey })
      let saved: ImportForm | null = null
      if (patching) {
        try {
          saved = await updateImportForm(
            wh,
            slug,
            toUpdateInput({ ...draft, version: draft.version ?? form.version }),
          )
        } catch (e) {
          if (!alive()) return
          if (isStaleImportFormError(e)) return await reloadAfterConflict()
          // Mã phiếu đã sửa trùng phiếu khác: báo dưới ô Mã (luồng soạn: về bước 1 để thấy).
          const message = codeTakenMessage(e)
          if (message) {
            if (runCtx) {
              useCodeTaken.getState().set('import', runCtx, draft.header.code, message)
            }
            // Checklist không có ô Mã phiếu → báo mức phiếu (lỗi không bao giờ bị nuốt).
            if (!leave) throw new ReceiveNotice(message)
            haptics.error()
            if (mounted.current) leave.toInfo()
            return
          }
          throw e
        }
        if (!alive()) return
        if (ownsDraft()) useReceiveDraft.getState().adoptServerForm(saved)
        await putDetail(saved)
        void queryClient.invalidateQueries({ queryKey: [...importFormKeys.warehouse(wh), 'list'] })
      }
      if (kind === 'save') {
        haptics.success()
        // Luồng soạn: Lưu xong về màn xem phiếu (bỏ mọi bước). Checklist: ở lại.
        if (leave) {
          leaving.current = true
          if (mounted.current) leave.toView(slug)
        }
        return
      }

      // Luồng soạn: chỉ xác nhận đúng version người dùng vừa xem (bản nháp / PATCH vừa xong) — không lấy
      // version của server mà người dùng chưa xem lại.
      const confirmVersion = saved?.version ?? draft.version ?? (compose ? null : form.version)
      if (confirmVersion == null) throw new ReceiveNotice(t(`${P}.conflictEdit`))
      try {
        await confirmImportForm(wh, slug, confirmVersion)
      } catch (e) {
        if (!alive()) return
        // Không biết chắc kết quả (vd hết giờ chờ mà server đã ghi) → tải lại phiếu + tồn kho.
        void queryClient.invalidateQueries({ queryKey: importFormKeys.warehouse(wh) })
        void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
        // Đã lưu xong, chỉ bước xác nhận lỗi: phiếu vẫn Nháp với số đã lưu (bản nháp đã theo nó).
        if (saved) {
          throw new ReceiveNotice(
            t(`${P}.savedNotConfirmed`, { error: importFormErrorMessage(e, t) }),
          )
        }
        if (isStaleImportFormError(e)) return await reloadAfterConflict()
        throw e
      }
      if (!alive()) return
      leaving.current = true
      void queryClient.invalidateQueries({ queryKey: importFormKeys.warehouse(wh) })
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouse(wh) })
      haptics.success()
      if (mounted.current) {
        if (leave) leave.toView(slug)
        else router.back()
      }
      if (ownsDraft()) await useReceiveDraft.getState().discard()
    } finally {
      useReceiveDraft.getState().setSaving(false)
      // Luồng soạn ghi xong mà đang rời luồng: giữ `busy` tới khi màn tháo ra (nút vẫn quay, không nháy
      // "Chưa có thay đổi" trong lúc Stack pop). Checklist giữ hành vi cũ.
      if (mounted.current && !(compose && leaving.current)) setBusy(null)
    }
  }

  const guard = useGuardedAction(run, {
    onError: (e) => {
      haptics.error()
      const n =
        e instanceof ReceiveNotice
          ? { message: e.message, keys: e.keys, offerDiscard: e.offerDiscard }
          : { message: importFormErrorMessage(e, t), keys: [], offerDiscard: false }
      if (!compose) {
        setNotice({ message: n.message, keys: new Set(n.keys), offerDiscard: n.offerDiscard })
        return
      }
      if (!formSlug) return
      useFormNotice
        .getState()
        .show(
          n.offerDiscard
            ? { kind: 'import', formSlug, message: n.message, offerDiscard: true }
            : { kind: 'import', formSlug, message: n.message },
        )
    },
  })

  const start = async (kind: ReceiveActionKind) => {
    const ran = await guard.run(kind)
    // Thành công mà vẫn ở màn (Lưu xong ở checklist, huỷ hộp hỏi, phiên đổi) → mở khoá cho lần sau.
    if (ran && !leaving.current && mounted.current) guard.reset()
  }

  const code = useReceiveDraft((s) => s.draft?.header.code)
  const draftCtx = useReceiveDraft((s) => s.ctx)
  const codeError = useCodeTakenMessage(
    'import',
    draftCtx?.formSlug === formSlug ? draftCtx : null,
    code,
  )

  return {
    save: () => start('save'),
    confirm: () => start('confirm'),
    remove: () => start('delete'),
    busy,
    error: notice?.message ?? null,
    flagged: notice?.keys ?? NO_KEYS,
    offerDiscard: notice?.offerDiscard ?? false,
    dismissError: () => setNotice(null),
    codeError,
  }
}
