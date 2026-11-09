import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View, type TextInputInstance } from 'react-native'

import { AttachmentField } from '@/features/form-attachment'
import {
  deriveHeaderSupplier,
  type LocalLine,
  type ReceiveDraft,
  type ReceiveHeader,
} from '@/features/receive-checklist'
import { formatFullDate, parseLocalDate, todayLocalIso } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { FormInfoRow } from '@/shared/ui'

import {
  CODE_MAX,
  importHeaderErrors,
  REFERENCE_MAX,
  type ImportHeaderErrors,
} from './import-header'

/** Ô chữ của đầu phiếu (Bên bán, Ngày nhập là ô chọn). */
type TextField = 'invoiceCode' | 'code' | 'purchaseOrder' | 'note'
const TEXT_FIELDS: readonly TextField[] = ['invoiceCode', 'code', 'purchaseOrder', 'note']
const ERROR_FIELDS: readonly (keyof ImportHeaderErrors)[] = [
  'supplier',
  'invoiceCode',
  'code',
  'purchaseOrder',
]
const NO_TOUCHED: ReadonlySet<string> = new Set()
/** Nháy nền dòng chọn (Bên bán / Ngày nhập) khi "Tới" vào nó (dài hơn hiệu ứng ~600ms của dòng). */
const FLASH_MS = 700

/** Chữ thô người dùng gõ trong các ô chữ. */
type TextValues = Record<TextField, string>

function valuesOf(h: ReceiveHeader): TextValues {
  return {
    invoiceCode: h.invoiceCode,
    code: h.code,
    purchaseOrder: h.purchaseOrder ?? '',
    note: h.note ?? '',
  }
}

/** Chữ → trường của bản nháp: cắt khoảng trắng, mã viết hoa, ô tuỳ chọn trống → `null`. */
function normalize(v: TextValues): Pick<ReceiveHeader, TextField> {
  const optional = (s: string) => (s.trim() === '' ? null : s.trim())
  return {
    invoiceCode: v.invoiceCode.trim(),
    code: v.code.trim().toUpperCase(),
    purchaseOrder: optional(v.purchaseOrder),
    note: optional(v.note),
  }
}

/**
 * Bản nháp đổi (do chính ô ghi, hay từ ngoài — gộp sau lệch version, bỏ thay đổi trên máy…): ô nào có
 * chữ (đã chuẩn hoá) khác bản nháp → lấy theo bản nháp, KỂ CẢ ô đang focus (cùng cách màn soạn phiếu
 * xuất). Không đổi gì → trả `prev`.
 */
function resync(prev: TextValues, header: ReceiveHeader): TextValues {
  const local = normalize(prev)
  const fresh = valuesOf(header)
  let next = prev
  for (const f of TEXT_FIELDS) {
    if (local[f] !== header[f]) next = { ...next, [f]: fresh[f] }
  }
  return next
}

/** Dòng Bên bán: chọn được (phiếu mới, có `SUPPLIER_READ`), chỉ xem (phiếu đã có), hoặc ẩn (`null`). */
export type SupplierRow =
  | { kind: 'pick'; name: string | null; required: boolean; onPress: () => void }
  | { kind: 'readonly'; name: string | null }

/** Tên bên bán của các dòng mang `slug` (bản nháp chỉ giữ slug ở đầu phiếu). */
const supplierNameOf = (lines: readonly LocalLine[], slug: string | null) =>
  slug === null ? null : (lines.find((l) => l.supplierSlug === slug)?.supplierName ?? null)

/**
 * Dòng Bên bán của nhóm Thông tin theo bản nháp: phiếu đã có → chỉ xem, bên bán suy ra từ các dòng
 * (`deriveHeaderSupplier` — một phiếu có thể có nhiều bên bán); phiếu mới + chọn được (`SUPPLIER_READ`)
 * → dòng chọn (tên tra trong danh sách bên bán, không có thì theo dòng); không thì ẩn.
 */
export function supplierRowFor({
  draft,
  isNew,
  canPickSupplier,
  suppliers,
  supplierRequired,
  onPress,
}: {
  draft: ReceiveDraft
  isNew: boolean
  canPickSupplier: boolean
  suppliers: readonly { slug: string; name: string }[] | undefined
  supplierRequired: boolean
  onPress: () => void
}): SupplierRow | null {
  if (!isNew) {
    const ls = draft.lines
    return {
      kind: 'readonly',
      name: supplierNameOf(ls, deriveHeaderSupplier(ls.map((l) => l.supplierSlug))),
    }
  }
  if (!canPickSupplier) return null
  const slug = draft.header.supplierSlug
  const name =
    slug === null
      ? null
      : (suppliers?.find((s) => s.slug === slug)?.name ?? supplierNameOf(draft.lines, slug))
  return { kind: 'pick', name, required: supplierRequired, onPress }
}

/** Dòng "Chứng từ": kho để tải lên + khoá bản nháp (kết quả về muộn của bản nháp khác bị bỏ). */
export type HeaderAttachment = {
  warehouseSlug: string | undefined
  getFormKey: () => string | null
}

export type ImportHeaderFieldsHandle = {
  /** "Tới" vào ô (`MissingTarget` `header`): focus ô chữ, hoặc nháy nền dòng chọn; lỗi của ô hiện luôn. */
  focus: (field: string) => void
  /** Bấm nút chính: hiện lỗi của mọi ô. */
  revealErrors: () => void
}

/**
 * Đầu phiếu nhập (bước 1 "Thông tin", wizard-apple §5): HAI khối kiểu Cài đặt iOS (`FormInfoRow` trong khối
 * bo, không tiêu đề nhóm) — khối BẮT BUỘC: Bên bán (phiếu mới: chạm → sheet `/import-supplier`; phiếu đã có:
 * chỉ xem, bên bán suy ra từ các dòng), Số HĐ, Ngày nhập (iOS: chạm → lịch `inline` mở ngay dưới dòng;
 * Android: hộp chọn ngày gốc), Mã phiếu (viết hoa khi gõ); khối TUỲ CHỌN: Số PO, Ghi chú, Chứng từ (khi có
 * `attachment` — `AttachmentField`, ghi `file` riêng qua `onChange`). Mỗi ô chữ giữ chữ đang gõ và ghi ngay trường đó (đã chuẩn hoá) vào bản
 * nháp qua `onChange`; bản nháp đổi từ ngoài → ô có trường bị đổi theo bản nháp ngay (kể cả ô đang
 * focus). Lỗi ô (`importHeaderErrors`) hiện sau lần rời ô đầu tiên, sau "Tới", hoặc sau `revealErrors`;
 * `codeError` (trùng mã từ server) thắng lỗi trên máy của ô Mã. `disabled` (đang ghi): không sửa được.
 */
export function ImportHeaderFields({
  header,
  onChange,
  supplier,
  supplierRequired,
  isNew,
  codeError,
  disabled,
  attachment,
  ref,
}: {
  header: ReceiveHeader
  onChange: (patch: Partial<ReceiveHeader>) => void
  supplier: SupplierRow | null
  supplierRequired: boolean
  isNew: boolean
  codeError: string | null
  disabled: boolean
  attachment?: HeaderAttachment
  ref?: Ref<ImportHeaderFieldsHandle>
}) {
  const { t } = useTranslation('importForms')
  const { colors, radius } = useTheme()
  const [values, setValues] = useState(() => valuesOf(header))
  const [touched, setTouched] = useState<ReadonlySet<string>>(NO_TOUCHED)
  const [flash, setFlash] = useState<'supplier' | 'date' | null>(null)

  // Bản nháp đổi (do chính ô ghi, hay từ ngoài): đồng bộ ngay trong lần vẽ này.
  const [seen, setSeen] = useState(header)
  if (seen !== header) {
    setSeen(header)
    setValues(resync(values, header))
  }

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(timer)
  }, [flash])

  const groupStyle = {
    backgroundColor: colors.card,
    borderRadius: radius.groupLarge,
    overflow: 'hidden',
  } as const

  const touch = (f: string) => setTouched((s) => (s.has(f) ? s : new Set(s).add(f)))
  const invoiceCode = useRef<TextInputInstance>(null)
  const code = useRef<TextInputInstance>(null)
  const purchaseOrder = useRef<TextInputInstance>(null)
  const note = useRef<TextInputInstance>(null)
  useImperativeHandle(
    ref,
    () => ({
      focus: (field) => {
        touch(field)
        if (field === 'supplier' || field === 'date') {
          setFlash(field)
          return
        }
        const input = { invoiceCode, code, purchaseOrder, note }[field as TextField]
        input?.current?.focus()
      },
      revealErrors: () => setTouched(new Set(ERROR_FIELDS)),
    }),
    [],
  )

  const change = (f: TextField, text: string) => {
    const next = { ...values, [f]: f === 'code' ? text.toUpperCase() : text }
    setValues(next)
    onChange({ [f]: normalize(next)[f] })
  }
  /** Props chung của một ô chữ: chữ cục bộ, ghi khi gõ, rời ô lần đầu → lỗi của ô hiện. */
  const input = (f: TextField) => ({
    value: values[f],
    onChangeText: (text: string) => change(f, text),
    onBlur: () => touch(f),
    editable: !disabled,
  })

  const errors = importHeaderErrors(
    { ...header, ...normalize(values) },
    { supplierRequired, isNew },
    t,
  )
  const shown = (f: keyof ImportHeaderErrors) => (touched.has(f) ? errors[f] : undefined)

  const pickDate = (date: Date | undefined) => {
    if (!date || disabled) return
    const iso = todayLocalIso(date)
    if (iso !== header.date) {
      haptics.selection()
      onChange({ date: iso })
    }
  }
  // Android: hộp lịch gốc của hệ thống. iOS: viên ngày `compact` gốc ngay trên dòng (chạm → lịch gốc nổi).
  const openDate = () => {
    if (disabled) return
    DateTimePickerAndroid.open({
      value: parseLocalDate(header.date),
      mode: 'date',
      onValueChange: (_e, date) => pickDate(date),
    })
  }

  return (
    <View style={{ gap: 14 }}>
      <View testID="import-group-required" style={groupStyle}>
        {supplier?.kind === 'pick' ? (
          <FormInfoRow
            kind="picker"
            first
            testID="import-field-supplier"
            label={t('compose.fields.supplier')}
            value={supplier.name}
            required={supplier.required}
            chevron="right"
            highlighted={flash === 'supplier'}
            error={shown('supplier')}
            onPress={() => {
              if (!disabled) supplier.onPress()
            }}
          />
        ) : supplier?.kind === 'readonly' ? (
          <FormInfoRow
            kind="readonly"
            first
            testID="import-field-supplier"
            label={t('compose.fields.supplier')}
            value={supplier.name ?? '—'}
          />
        ) : null}
        <FormInfoRow
          kind="input"
          first={!supplier}
          testID="import-field-invoiceCode"
          label={t('compose.fields.invoiceCode')}
          required
          code
          autoCapitalize="characters"
          maxLength={REFERENCE_MAX}
          inputRef={invoiceCode}
          error={shown('invoiceCode')}
          {...input('invoiceCode')}
        />
        {Platform.OS === 'android' ? (
          <FormInfoRow
            kind="picker"
            testID="import-field-date"
            label={t('compose.fields.date')}
            value={formatFullDate(header.date)}
            chevron="down"
            highlighted={flash === 'date'}
            disabled={disabled}
            onPress={openDate}
          />
        ) : (
          <FormInfoRow
            kind="custom"
            testID="import-field-date"
            label={t('compose.fields.date')}
            highlighted={flash === 'date'}
          >
            <DateTimePicker
              testID="import-date-picker"
              mode="date"
              display="compact"
              accessibilityLabel={t('compose.fields.date')}
              disabled={disabled}
              value={parseLocalDate(header.date)}
              onValueChange={(_e, date) => pickDate(date)}
            />
          </FormInfoRow>
        )}
        <FormInfoRow
          kind="input"
          testID="import-field-code"
          label={t('compose.fields.code')}
          required
          code
          autoCapitalize="characters"
          maxLength={CODE_MAX}
          inputRef={code}
          error={codeError ?? shown('code')}
          {...input('code')}
        />
      </View>
      <View testID="import-group-optional" style={groupStyle}>
        <FormInfoRow
          kind="input"
          first
          testID="import-field-purchaseOrder"
          label={t('compose.fields.purchaseOrder')}
          code
          autoCapitalize="characters"
          maxLength={REFERENCE_MAX}
          inputRef={purchaseOrder}
          error={shown('purchaseOrder')}
          {...input('purchaseOrder')}
        />
        <FormInfoRow
          kind="input"
          testID="import-field-note"
          label={t('compose.fields.note')}
          multiline
          autoCapitalize="sentences"
          inputRef={note}
          {...input('note')}
        />
        {attachment ? (
          <AttachmentField
            kind="import"
            testID="import-field-file"
            label={t('fieldFile')}
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
