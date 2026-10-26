import { format } from 'date-fns'
import { z } from 'zod'
import { BUSINESS_CODE_REGEX } from '@/shared/lib/code'
import {
  DECIMAL_18_2_LIMIT,
  DECIMAL_18_6_LIMIT,
  hasAtMostDecimals,
  roundMoney,
} from '@/shared/lib/number'
import type {
  AvailableMaterial,
  AvailableUnit,
  ImportForm,
  ImportFormInput,
  ImportFormItemInput,
  ImportFormUpdateInput,
} from '@/entities/import-form'
import { deriveHeaderSupplier } from './supplier'

export const IMPORT_FORM_ITEMS_MAX = 200
const REFERENCE_MAX = 64
const FILE_MAX = 1024
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const itemSchema = z.object({
  materialSlug: z.string().min(1, 'importForms:materialRequired'),
  unitSlug: z.string().min(1, 'importForms:unitRequired'),
  quantity: z
    .number({ error: 'importForms:quantityInvalid' })
    .refine((v) => v > 0 && hasAtMostDecimals(v, 6), 'importForms:quantityInvalid')
    .refine((v) => v < DECIMAL_18_6_LIMIT, 'importForms:quantityTooLarge'),
  unitPrice: z
    .number({ error: 'importForms:unitPriceInvalid' })
    .refine((v) => v >= 0 && hasAtMostDecimals(v, 2), 'importForms:unitPriceInvalid')
    .refine((v) => v < DECIMAL_18_2_LIMIT, 'importForms:unitPriceTooLarge'),
  /** `YYYY-MM-DD`; `''` = không có hạn. Luật "không trước ngày phiếu" nằm ở `superRefine` (cần `date`). */
  expiryDate: z.string(),
  note: z.string(),
  /** Bên bán riêng của dòng; `''` = theo đầu phiếu. */
  supplierOverride: z.string(),
})

export function buildImportFormSchema(opts: { requireSupplier: boolean }) {
  return z
    .object({
      supplierSlug: opts.requireSupplier
        ? z.string().min(1, 'importForms:supplierRequired')
        : z.string(),
      code: z
        .string()
        .trim()
        .min(1, 'importForms:codeRequired')
        .regex(BUSINESS_CODE_REGEX, 'importForms:codeInvalid'),
      invoiceCode: z
        .string()
        .trim()
        .min(1, 'importForms:invoiceCodeRequired')
        .max(REFERENCE_MAX, 'importForms:referenceTooLong'),
      purchaseOrder: z.string().trim().max(REFERENCE_MAX, 'importForms:referenceTooLong'),
      // DatePicker trả `undefined` khi xoá — nhận rồi báo "bắt buộc" thay vì lỗi sai kiểu của Zod.
      date: z
        .string()
        .optional()
        .refine((v) => v !== undefined && DATE_REGEX.test(v), 'importForms:dateRequired'),
      file: z.string().max(FILE_MAX, 'importForms:fileTooLong'),
      note: z.string(),
      items: z
        .array(itemSchema)
        .min(1, 'importForms:itemsRequired')
        .max(IMPORT_FORM_ITEMS_MAX, 'importForms:itemsTooMany'),
    })
    .superRefine((values, ctx) => {
      // Backend 101324: cùng vật tư + cùng đơn vị không được lặp. Báo ở dòng xuất hiện SAU.
      const seen = new Set<string>()
      values.items.forEach((item, index) => {
        if (!item.materialSlug || !item.unitSlug) return
        const key = `${item.materialSlug}|${item.unitSlug}`
        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'unitSlug'],
            message: 'importForms:itemDuplicated',
          })
        }
        seen.add(key)
      })
      // Backend 101333: hạn dùng không được trước ngày phiếu (bằng thì được). `YYYY-MM-DD` so chuỗi đúng thứ tự ngày.
      const date = values.date
      if (date !== undefined && DATE_REGEX.test(date)) {
        values.items.forEach((item, index) => {
          if (item.expiryDate !== '' && item.expiryDate < date) {
            ctx.addIssue({
              code: 'custom',
              path: ['items', index, 'expiryDate'],
              message: 'importForms:expiryBeforeDate',
            })
          }
        })
      }
    })
}

export const importFormSchema = buildImportFormSchema({ requireSupplier: false })

export type ImportFormValues = z.input<typeof importFormSchema>
export type ImportFormItemValues = ImportFormValues['items'][number]

export const EMPTY_ITEM: ImportFormItemValues = {
  materialSlug: '',
  unitSlug: '',
  quantity: undefined as unknown as number,
  unitPrice: undefined as unknown as number,
  expiryDate: '',
  note: '',
  supplierOverride: '',
}

/** NCC hiệu lực của dòng: ghi đè riêng, không có thì theo đầu phiếu. */
export const effectiveSupplier = (values: ImportFormValues, index: number): string =>
  values.items[index]?.supplierOverride || values.supplierSlug

/** Gợi ý mã theo giờ máy, sửa được: `PN-YYYYMMDD-HHmm`. Trùng thì backend trả 101304 tại ô mã. */
export const suggestCode = (now: Date): string => `PN-${format(now, 'yyyyMMdd-HHmm')}`

export const todayValue = (now: Date): string => format(now, 'yyyy-MM-dd')

export function emptyFormValues(now: Date): ImportFormValues {
  return {
    supplierSlug: '',
    code: suggestCode(now),
    invoiceCode: '',
    purchaseOrder: '',
    date: todayValue(now),
    file: '',
    note: '',
    items: [{ ...EMPTY_ITEM }],
  }
}

/**
 * `canPickSupplier` (có SUPPLIER_READ): đầu phiếu = NCC phổ biến nhất, chỉ dòng khác đầu phiếu mới ghi đè.
 * Không có quyền: không chọn được NCC nên đầu phiếu `''` và giữ NCC cũ của từng dòng trong `supplierOverride`
 * để PATCH gửi lại nguyên vẹn (không làm mất NCC đã lưu). Bỏ qua tham số = hành vi không quyền.
 */
export function toFormValues(
  form: ImportForm,
  opts: { canPickSupplier: boolean } = { canPickSupplier: false },
): ImportFormValues {
  const items = form.items ?? []
  const header = opts.canPickSupplier ? deriveHeaderSupplier(items.map((i) => i.supplierSlug)) : ''
  return {
    supplierSlug: header,
    code: form.code,
    invoiceCode: form.invoiceCode,
    purchaseOrder: form.purchaseOrder ?? '',
    date: form.date,
    file: form.file ?? '',
    note: form.note ?? '',
    items: items.map((item) => {
      const own = item.supplierSlug ?? ''
      return {
        materialSlug: item.materialSlug,
        unitSlug: item.unitSlug,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        expiryDate: item.expiryDate ?? '',
        note: item.note ?? '',
        supplierOverride: opts.canPickSupplier ? (own === header ? '' : own) : own,
      }
    }),
  }
}

function toItemInput(values: ImportFormValues, index: number): ImportFormItemInput {
  const item = values.items[index]
  const note = item.note.trim()
  const supplierSlug = effectiveSupplier(values, index)
  return {
    materialSlug: item.materialSlug,
    unitSlug: item.unitSlug,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    ...(item.expiryDate !== '' && { expiryDate: item.expiryDate }),
    ...(note !== '' && { note }),
    ...(supplierSlug !== '' && { supplierSlug }),
  }
}

/** Tạo: bỏ trường tuỳ chọn rỗng. Gọi SAU khi schema đã qua (`date` chắc chắn có). */
export function toCreateInput(values: ImportFormValues): ImportFormInput {
  const purchaseOrder = values.purchaseOrder.trim()
  const note = values.note.trim()
  return {
    code: values.code.trim().toUpperCase(),
    invoiceCode: values.invoiceCode.trim(),
    date: values.date ?? '',
    ...(purchaseOrder !== '' && { purchaseOrder }),
    ...(values.file !== '' && { file: values.file }),
    ...(note !== '' && { note }),
    items: values.items.map((_, i) => toItemInput(values, i)),
  }
}

/**
 * Sửa: gửi ĐỦ đầu phiếu — `''` là cách duy nhất để xoá PO / file / ghi chú với PATCH partial — cùng TOÀN BỘ dòng
 * (backend thay hết dòng khi có `items`) và `version` để phát hiện xung đột.
 */
export function toUpdateInput(values: ImportFormValues, version: number): ImportFormUpdateInput {
  return {
    version,
    code: values.code.trim().toUpperCase(),
    invoiceCode: values.invoiceCode.trim(),
    date: values.date ?? '',
    purchaseOrder: values.purchaseOrder.trim(),
    file: values.file,
    note: values.note.trim(),
    items: values.items.map((_, i) => toItemInput(values, i)),
  }
}

/** Thành tiền xem trước — server mới là nguồn đúng (`amount`). */
export function lineAmount(quantity?: number, unitPrice?: number): number | undefined {
  if (quantity === undefined || unitPrice === undefined) return undefined
  return roundMoney(quantity * unitPrice)
}

/** Cộng dồn đúng như backend: `total = roundMoney(total + amount)` từng dòng, dòng chưa đủ số thì bỏ qua. */
export function formTotal(items: { quantity?: number; unitPrice?: number }[]): number {
  let total = 0
  for (const item of items) {
    const amount = lineAmount(item.quantity, item.unitPrice)
    if (amount !== undefined) total = roundMoney(total + amount)
  }
  return total
}

export function baseUnitOf(material: AvailableMaterial): AvailableUnit | undefined {
  return material.units.find((u) => u.isBaseUnit)
}
