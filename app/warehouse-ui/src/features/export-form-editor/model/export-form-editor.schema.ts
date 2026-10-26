import { format } from 'date-fns'
import { z } from 'zod'
import { BUSINESS_CODE_REGEX } from '@/shared/lib/code'
import { DECIMAL_18_2_LIMIT, DECIMAL_18_6_LIMIT, hasAtMostDecimals } from '@/shared/lib/number'
import {
  EXPORT_FORM_TYPES,
  type ExportForm,
  type ExportFormInput,
  type ExportFormItemInput,
  type ExportFormType,
  type ExportFormUpdateInput,
} from '@/entities/export-form'

export const EXPORT_FORM_ITEMS_MAX = 200
const RECEIVER_MAX = 255
const REFERENCE_MAX = 64
const FILE_MAX = 1024

const saleUnitPrice = z
  .number({ error: 'exportForms:unitPriceInvalid' })
  .refine((v) => v >= 0 && hasAtMostDecimals(v, 2), 'exportForms:unitPriceInvalid')
  .refine((v) => v < DECIMAL_18_2_LIMIT, 'exportForms:unitPriceTooLarge')

/** Không phải Bán: ô giá bị ẩn và gửi 0, nên nhận mọi giá trị. Khai cùng kiểu để `ExportFormValues` không đổi. */
const ignoredUnitPrice = z.any() as unknown as typeof saleUnitPrice

function buildItemSchema(sale: boolean) {
  return z.object({
    materialSlug: z.string().min(1, 'exportForms:materialRequired'),
    unitSlug: z.string().min(1, 'exportForms:unitRequired'),
    quantity: z
      .number({ error: 'exportForms:quantityInvalid' })
      .refine((v) => v > 0 && hasAtMostDecimals(v, 6), 'exportForms:quantityInvalid')
      .refine((v) => v < DECIMAL_18_6_LIMIT, 'exportForms:quantityTooLarge'),
    unitPrice: sale ? saleUnitPrice : ignoredUnitPrice,
    /** `''` = để BE tự chọn lô (FEFO). */
    batchSlug: z.string(),
    note: z.string(),
  })
}

export function buildExportFormSchema(opts: { sale: boolean }) {
  return z
    .object({
      type: z.enum(EXPORT_FORM_TYPES, { error: 'exportForms:typeRequired' }),
      receiver: z
        .string()
        .trim()
        .min(1, 'exportForms:receiverRequired')
        .max(RECEIVER_MAX, 'exportForms:receiverTooLong'),
      purchaseOrder: z
        .string()
        .trim()
        .min(1, 'exportForms:purchaseOrderRequired')
        .max(REFERENCE_MAX, 'exportForms:referenceTooLong'),
      invoiceCode: z.string().trim().max(REFERENCE_MAX, 'exportForms:referenceTooLong'),
      file: z.string().max(FILE_MAX, 'exportForms:fileTooLong'),
      note: z.string(),
      code: z
        .string()
        .trim()
        .min(1, 'exportForms:codeRequired')
        .regex(BUSINESS_CODE_REGEX, 'exportForms:codeInvalid'),
      items: z
        .array(buildItemSchema(opts.sale))
        .min(1, 'exportForms:itemsRequired')
        .max(EXPORT_FORM_ITEMS_MAX, 'exportForms:itemsTooMany'),
    })
    .superRefine((values, ctx) => {
      // Cùng (vật tư, đơn vị, lô) không được lặp. Báo ở ô lô của dòng xuất hiện SAU.
      const seen = new Set<string>()
      values.items.forEach((item, index) => {
        if (!item.materialSlug || !item.unitSlug) return
        const key = `${item.materialSlug}|${item.unitSlug}|${item.batchSlug}`
        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'batchSlug'],
            message: 'exportForms:itemDuplicated',
          })
        }
        seen.add(key)
      })
    })
}

/** Cùng kiểu cho cả hai biến thể (`sale` true/false) — xem `ignoredUnitPrice`. */
export type ExportFormValues = z.input<ReturnType<typeof buildExportFormSchema>>
export type ExportFormItemValues = ExportFormValues['items'][number]

export const EMPTY_EXPORT_ITEM: ExportFormItemValues = {
  materialSlug: '',
  unitSlug: '',
  quantity: undefined as unknown as number,
  unitPrice: undefined as unknown as number,
  batchSlug: '',
  note: '',
}

/** Gợi ý mã theo giờ máy, sửa được: `PX-YYYYMMDD-HHmm`. */
export const suggestExportCode = (now: Date): string => `PX-${format(now, 'yyyyMMdd-HHmm')}`

export function emptyExportFormValues(now: Date): ExportFormValues {
  return {
    // Chưa chọn lý do: người dùng phải chọn một trong 5 nút.
    type: undefined as unknown as ExportFormType,
    receiver: '',
    purchaseOrder: '',
    invoiceCode: '',
    file: '',
    note: '',
    code: suggestExportCode(now),
    items: [{ ...EMPTY_EXPORT_ITEM }],
  }
}

/** Phiếu không phải Bán: giá trống để đổi sang Bán thì phải nhập (không "hồi sinh" 0 đã lưu). */
export function toExportFormValues(form: ExportForm): ExportFormValues {
  const sale = form.type === 'SALE'
  return {
    type: form.type,
    receiver: form.receiver,
    purchaseOrder: form.purchaseOrder,
    invoiceCode: form.invoiceCode ?? '',
    file: form.file ?? '',
    note: form.note ?? '',
    code: form.code,
    items: (form.items ?? []).map((item) => ({
      materialSlug: item.materialSlug,
      unitSlug: item.unitSlug,
      quantity: item.quantity,
      unitPrice: sale ? item.unitPrice : (undefined as unknown as number),
      batchSlug: item.batchSlug ?? '',
      note: item.note ?? '',
    })),
  }
}

function toItemInput(item: ExportFormItemValues, sale: boolean): ExportFormItemInput {
  const note = item.note.trim()
  return {
    materialSlug: item.materialSlug,
    unitSlug: item.unitSlug,
    quantity: item.quantity,
    unitPrice: sale ? item.unitPrice : 0,
    ...(item.batchSlug !== '' && { batchSlug: item.batchSlug }),
    ...(note !== '' && { note }),
  }
}

/** Tạo: bỏ trường tuỳ chọn rỗng. Gọi SAU khi schema đã qua. */
export function toExportFormInput(values: ExportFormValues): ExportFormInput {
  const sale = values.type === 'SALE'
  const invoiceCode = values.invoiceCode.trim()
  const note = values.note.trim()
  return {
    code: values.code.trim().toUpperCase(),
    type: values.type,
    purchaseOrder: values.purchaseOrder.trim(),
    receiver: values.receiver.trim(),
    ...(invoiceCode !== '' && { invoiceCode }),
    ...(values.file !== '' && { file: values.file }),
    ...(note !== '' && { note }),
    items: values.items.map((item) => toItemInput(item, sale)),
  }
}

/** Sửa: gửi ĐỦ đầu phiếu — `''` xoá ô tuỳ chọn — cùng TOÀN BỘ dòng và `version` của phiếu gốc. */
export function toExportFormUpdate(
  values: ExportFormValues,
  original: Pick<ExportForm, 'version'>,
): ExportFormUpdateInput {
  const sale = values.type === 'SALE'
  return {
    version: original.version,
    code: values.code.trim().toUpperCase(),
    type: values.type,
    purchaseOrder: values.purchaseOrder.trim(),
    receiver: values.receiver.trim(),
    invoiceCode: values.invoiceCode.trim(),
    file: values.file,
    note: values.note.trim(),
    items: values.items.map((item) => toItemInput(item, sale)),
  }
}
