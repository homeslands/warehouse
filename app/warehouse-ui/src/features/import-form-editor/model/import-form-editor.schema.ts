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
  note: z.string(),
})

export const importFormSchema = z
  .object({
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
  })

export type ImportFormValues = z.input<typeof importFormSchema>
export type ImportFormItemValues = ImportFormValues['items'][number]

export const EMPTY_ITEM: ImportFormItemValues = {
  materialSlug: '',
  unitSlug: '',
  quantity: undefined as unknown as number,
  unitPrice: undefined as unknown as number,
  note: '',
}

/** Gợi ý mã theo giờ máy, sửa được: `PN-YYYYMMDD-HHmm`. Trùng thì backend trả 101304 tại ô mã. */
export const suggestCode = (now: Date): string => `PN-${format(now, 'yyyyMMdd-HHmm')}`

export const todayValue = (now: Date): string => format(now, 'yyyy-MM-dd')

export function emptyFormValues(now: Date): ImportFormValues {
  return {
    code: suggestCode(now),
    invoiceCode: '',
    purchaseOrder: '',
    date: todayValue(now),
    file: '',
    note: '',
    items: [{ ...EMPTY_ITEM }],
  }
}

export function toFormValues(form: ImportForm): ImportFormValues {
  return {
    code: form.code,
    invoiceCode: form.invoiceCode,
    purchaseOrder: form.purchaseOrder ?? '',
    date: form.date,
    file: form.file ?? '',
    note: form.note ?? '',
    items: (form.items ?? []).map((item) => ({
      materialSlug: item.materialSlug,
      unitSlug: item.unitSlug,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      note: item.note ?? '',
    })),
  }
}

function toItemInput(item: ImportFormItemValues): ImportFormItemInput {
  const note = item.note.trim()
  return {
    materialSlug: item.materialSlug,
    unitSlug: item.unitSlug,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    ...(note !== '' && { note }),
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
    items: values.items.map(toItemInput),
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
    items: values.items.map(toItemInput),
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
