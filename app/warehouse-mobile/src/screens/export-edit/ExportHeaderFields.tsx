import { useRouter } from 'expo-router'
import type { TFunction } from 'i18next'
import { useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { View, type TextInputInstance } from 'react-native'

import type { ExportFormType } from '@/entities/export-form'
import type { ExportHeader } from '@/features/export-draft'
import { AttachmentField } from '@/features/form-attachment'
import { todayLocalIso } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import { FormInfoRow } from '@/shared/ui'

import { RECEIVER_MAX, ReceiverField } from './ReceiverField'

/** `BUSINESS_CODE_REGEX` của backend (bản chép ở web `shared/lib/code.ts`). */
const BUSINESS_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/
const CODE_MAX = 32
/** `EXPORT_FORM_REFERENCE_MAX_LENGTH` (PO, số HĐ). */
const REFERENCE_MAX = 64

const two = (n: number) => String(n).padStart(2, '0')

/** Gợi ý mã theo giờ máy, cùng khuôn phiếu nhập: `PX-yyyyMMdd-HHmm`. */
export function suggestExportCode(now: Date = new Date()): string {
  return `PX-${todayLocalIso(now).replace(/-/g, '')}-${two(now.getHours())}${two(now.getMinutes())}`
}

/** Giá trị các ô (chuỗi thô người dùng gõ). */
export type HeaderValues = {
  code: string
  type: ExportFormType
  purchaseOrder: string
  invoiceCode: string
  receiver: string
  note: string
}

export type HeaderErrors = Partial<
  Record<'code' | 'purchaseOrder' | 'invoiceCode' | 'receiver', string>
>

export function valuesOf(h: ExportHeader): HeaderValues {
  return {
    code: h.code,
    type: h.type,
    purchaseOrder: h.purchaseOrder,
    invoiceCode: h.invoiceCode ?? '',
    receiver: h.receiver,
    note: h.note ?? '',
  }
}

/** Kiểm như DTO backend (mã, PO + người nhận bắt buộc, độ dài); câu lỗi là `exportForms:errors.*`. */
export function headerErrors(v: HeaderValues, t: TFunction): HeaderErrors {
  const code = v.code.trim()
  const po = v.purchaseOrder.trim()
  const receiver = v.receiver.trim()
  const e = (key: string) => t(`exportForms:errors.${key}`)
  return {
    code:
      code === ''
        ? e('codeRequired')
        : !BUSINESS_CODE_REGEX.test(code)
          ? e('codeInvalid')
          : undefined,
    purchaseOrder:
      po === ''
        ? e('purchaseOrderRequired')
        : po.length > REFERENCE_MAX
          ? e('purchaseOrderInvalid')
          : undefined,
    invoiceCode: v.invoiceCode.trim().length > REFERENCE_MAX ? e('invoiceCodeInvalid') : undefined,
    receiver:
      receiver === ''
        ? e('receiverRequired')
        : receiver.length > RECEIVER_MAX
          ? e('receiverInvalid')
          : undefined,
  }
}

/** Đầu phiếu của bản nháp: cắt khoảng trắng, mã viết hoa, ô tuỳ chọn trống → `null`. */
export function toHeader(v: HeaderValues): ExportHeader {
  const optional = (s: string) => (s.trim() === '' ? null : s.trim())
  return {
    code: v.code.trim().toUpperCase(),
    type: v.type,
    purchaseOrder: v.purchaseOrder.trim(),
    invoiceCode: optional(v.invoiceCode),
    receiver: v.receiver.trim(),
    note: optional(v.note),
    // Chứng từ không phải ô chữ: ô chỉ ghi từng trường chữ (`toHeader(next)[f]`), không đụng `file`.
    file: null,
  }
}

/** Trường chữ của đầu phiếu (Loại là ô chọn; Người nhận là chữ nhưng chọn qua sheet). */
type TextField = 'code' | 'purchaseOrder' | 'receiver' | 'invoiceCode' | 'note'
const TEXT_FIELDS: readonly TextField[] = [
  'code',
  'purchaseOrder',
  'receiver',
  'invoiceCode',
  'note',
]
const ERROR_FIELDS: readonly (keyof HeaderErrors)[] = [
  'code',
  'purchaseOrder',
  'receiver',
  'invoiceCode',
]
const NO_TOUCHED: ReadonlySet<string> = new Set()

/**
 * Bản nháp đổi (do chính ô ghi, hay từ ngoài — gộp sau lệch version, bỏ thay đổi trên máy…): ô nào có
 * chữ (đã chuẩn hoá) khác bản nháp → lấy theo bản nháp, KỂ CẢ ô đang focus. Mỗi lần gõ đã ghi ngay
 * trường của ô nên chữ ô vừa gõ luôn khớp bản nháp (chữ thô như khoảng trắng cuối được giữ); chỉ khi
 * chính trường đó bị đổi từ ngoài thì ô mới bị thay — trước lần gõ kế tiếp, nên không lần gõ nào ghi đè
 * lại giá trị cũ. Không đổi gì → trả `prev`.
 */
function resync(prev: HeaderValues, header: ExportHeader): HeaderValues {
  const local = toHeader(prev)
  const fresh = valuesOf(header)
  let next = prev
  for (const f of TEXT_FIELDS) {
    if (local[f] !== header[f]) next = { ...next, [f]: fresh[f] }
  }
  return prev.type === header.type ? next : { ...next, type: header.type }
}

/** Dòng "Chứng từ": kho để tải lên + khoá bản nháp (kết quả về muộn của bản nháp khác bị bỏ). */
export type HeaderAttachment = {
  warehouseSlug: string | undefined
  getFormKey: () => string | null
}

export type ExportHeaderFieldsHandle = {
  /** "Tới" vào ô (`MissingTarget` `header`): focus ô chữ / mở sheet Người nhận, lỗi của ô hiện luôn (Loại luôn có giá trị). */
  focus: (field: string) => void
  /** Bấm nút chính: hiện lỗi của mọi ô. */
  revealErrors: () => void
}

/**
 * Đầu phiếu xuất (bước 1 "Thông tin" của luồng 3 bước, spec form-wizard §4, wizard-apple §5): HAI khối kiểu
 * Cài đặt iOS (`FormInfoRow` trong khối bo, không tiêu đề nhóm) — khối BẮT BUỘC: Loại (dòng chọn chữ accent
 * "Sản xuất ⌄" → sheet `/export-type`), Mã phiếu (viết hoa khi gõ), Số PO, Người nhận (`ReceiverField` → sheet
 * `/export-receiver`; hai sheet ghi thẳng vào bản nháp); khối TUỲ CHỌN: Số HĐ, Ghi chú, Chứng từ (khi có `attachment` — `AttachmentField`, ghi
 * `file` riêng qua `onChange`, KHÔNG qua `toHeader`). Mỗi ô giữ chữ đang gõ; mỗi lần gõ ghi ngay trường đó (đã
 * chuẩn hoá — `toHeader`) vào bản nháp qua `onChange`. Bản nháp đổi từ ngoài → ô có trường bị đổi theo bản
 * nháp ngay (kể cả ô đang focus), ô khác giữ chữ. Lỗi của ô (`headerErrors`) hiện sau lần rời ô đầu tiên,
 * sau "Tới" vào ô, hoặc sau `revealErrors`; `codeError` (lỗi server, vd trùng mã) thắng lỗi kiểm trên máy
 * của ô Mã. `disabled` (đang ghi lên server): không sửa được, dòng Loại / Người nhận không mở.
 */
export function ExportHeaderFields({
  header,
  onChange,
  codeError,
  disabled,
  attachment,
  ref,
}: {
  header: ExportHeader
  onChange: (patch: Partial<ExportHeader>) => void
  codeError: string | null
  disabled: boolean
  attachment?: HeaderAttachment
  ref?: Ref<ExportHeaderFieldsHandle>
}) {
  const { t } = useTranslation('exportForms')
  const { colors, radius } = useTheme()
  const [values, setValues] = useState(() => valuesOf(header))
  const [touched, setTouched] = useState<ReadonlySet<string>>(NO_TOUCHED)
  const router = useRouter()

  // Bản nháp đổi (do chính ô ghi, hay từ ngoài): đồng bộ các ô không focus ngay trong lần vẽ này.
  const [seen, setSeen] = useState(header)
  if (seen !== header) {
    setSeen(header)
    setValues(resync(values, header))
  }

  const groupStyle = {
    backgroundColor: colors.card,
    borderRadius: radius.groupLarge,
    overflow: 'hidden',
  } as const

  const touch = (f: string) => setTouched((s) => (s.has(f) ? s : new Set(s).add(f)))
  const code = useRef<TextInputInstance>(null)
  const purchaseOrder = useRef<TextInputInstance>(null)
  const invoiceCode = useRef<TextInputInstance>(null)
  const note = useRef<TextInputInstance>(null)
  useImperativeHandle(
    ref,
    () => ({
      focus: (field) => {
        if (field === 'type') return
        touch(field)
        if (field === 'receiver') return openSheet('/export-receiver')
        const inputs: Partial<Record<string, typeof code>> = {
          code,
          purchaseOrder,
          invoiceCode,
          note,
        }
        inputs[field]?.current?.focus()
      },
      revealErrors: () => setTouched(new Set(ERROR_FIELDS)),
    }),
    // Không deps: `openSheet` đọc `disabled` / router của lần vẽ mới nhất.
  )

  const change = (f: TextField, text: string) => {
    const next = { ...values, [f]: f === 'code' ? text.toUpperCase() : text }
    setValues(next)
    onChange({ [f]: toHeader(next)[f] })
  }
  /** Rời ô (lần đầu → lỗi của ô hiện), khoá khi đang ghi. */
  const focusing = (f: TextField) => ({
    onBlur: () => touch(f),
    editable: !disabled,
  })
  /** Props chung của một ô chữ: chữ cục bộ, ghi khi gõ. */
  const input = (f: TextField) => ({
    value: values[f],
    onChangeText: (text: string) => change(f, text),
    ...focusing(f),
  })

  const errors = headerErrors(values, t)
  const shown = (f: keyof HeaderErrors) => (touched.has(f) ? errors[f] : undefined)
  /** Mở sheet chọn (khoá khi đang ghi). Rời dòng Người nhận để chọn → lỗi của ô hiện khi quay lại. */
  function openSheet(href: '/export-type' | '/export-receiver') {
    if (disabled) return
    if (href === '/export-receiver') touch('receiver')
    router.navigate(href)
  }

  return (
    <View style={{ gap: 14 }}>
      <View testID="export-group-required" style={groupStyle}>
        <FormInfoRow
          kind="picker"
          first
          testID="export-field-type"
          label={t('fields.type')}
          value={t(`type.${header.type}`)}
          chevron="down"
          accentValue
          onPress={() => openSheet('/export-type')}
        />
        <FormInfoRow
          kind="input"
          testID="export-field-code"
          label={t('fields.code')}
          required
          code
          autoCapitalize="characters"
          maxLength={CODE_MAX}
          inputRef={code}
          error={codeError ?? shown('code')}
          {...input('code')}
        />
        <FormInfoRow
          kind="input"
          testID="export-field-purchaseOrder"
          label={t('fields.purchaseOrder')}
          required
          code
          autoCapitalize="characters"
          maxLength={REFERENCE_MAX}
          inputRef={purchaseOrder}
          error={shown('purchaseOrder')}
          {...input('purchaseOrder')}
        />
        <ReceiverField
          value={values.receiver}
          error={shown('receiver')}
          onPress={() => openSheet('/export-receiver')}
        />
      </View>
      <View testID="export-group-optional" style={groupStyle}>
        <FormInfoRow
          kind="input"
          first
          testID="export-field-invoiceCode"
          label={t('fields.invoiceCode')}
          code
          autoCapitalize="characters"
          maxLength={REFERENCE_MAX}
          inputRef={invoiceCode}
          error={shown('invoiceCode')}
          {...input('invoiceCode')}
        />
        <FormInfoRow
          kind="input"
          testID="export-field-note"
          label={t('fields.note')}
          multiline
          autoCapitalize="sentences"
          inputRef={note}
          {...input('note')}
        />
        {attachment ? (
          <AttachmentField
            kind="export"
            testID="export-field-file"
            label={t('fields.file')}
            warehouseSlug={attachment.warehouseSlug}
            value={header.file}
            onChange={(file) => onChange({ file })}
            getFormKey={attachment.getFormKey}
            disabled={disabled}
          />
        ) : null}
      </View>
    </View>
  )
}
