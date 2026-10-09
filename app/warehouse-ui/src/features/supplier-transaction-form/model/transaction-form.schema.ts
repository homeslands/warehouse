import { format } from 'date-fns'
import { z } from 'zod'
import {
  toTransactionDate,
  type SupplierTransactionInput,
  type SupplierTransactionType,
} from '@/entities/supplier'

// Không dùng String(): số < 1e-6 thành dạng mũ ('1e-7') và bị đếm 0 số lẻ.
const hasAtMostDecimals = (value: number, n: number) => Number(value.toFixed(n)) === value
const NOTE_MAX = 1000

export type TransactionFormValues = {
  type: SupplierTransactionType
  materialSlug: string
  quantity: number | undefined
  unitPrice: number | undefined
  amount: number | undefined
  transactionDate: string
  note: string
}

const isMaterialType = (type: SupplierTransactionType) => type === 'PURCHASE' || type === 'RETURN'

/** Luật khớp `CreateSupplierTransactionRequestDto`; ô không áp dụng cho loại đang chọn được bỏ qua. `today` để test cố định. */
export function transactionFormSchema(today: Date = new Date()) {
  const todayValue = format(today, 'yyyy-MM-dd')
  return z
    .object({
      type: z.enum(['PURCHASE', 'RETURN', 'PAYMENT']),
      materialSlug: z.string(),
      quantity: z.number().optional(),
      unitPrice: z.number().optional(),
      amount: z.number().optional(),
      transactionDate: z
        .string()
        .min(1, 'suppliers:dateRequired')
        .refine((v) => v <= todayValue, 'suppliers:dateFuture'),
      note: z.string().max(NOTE_MAX, 'suppliers:noteTooLong'),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message })
      if (isMaterialType(v.type)) {
        if (v.materialSlug === '') issue('materialSlug', 'suppliers:materialRequired')
        if (v.quantity === undefined) issue('quantity', 'suppliers:quantityRequired')
        else if (v.quantity <= 0 || !hasAtMostDecimals(v.quantity, 6))
          issue('quantity', 'suppliers:quantityInvalid')
        if (v.unitPrice === undefined) issue('unitPrice', 'suppliers:unitPriceRequired')
        else if (v.unitPrice < 0 || !hasAtMostDecimals(v.unitPrice, 2))
          issue('unitPrice', 'suppliers:unitPriceInvalid')
      } else if (v.amount === undefined) {
        issue('amount', 'suppliers:amountRequired')
      } else if (v.amount <= 0 || !hasAtMostDecimals(v.amount, 2)) {
        issue('amount', 'suppliers:amountInvalid')
      }
    })
}

export const previewAmount = (quantity?: number, unitPrice?: number): number | undefined =>
  quantity === undefined || unitPrice === undefined
    ? undefined
    : Number((quantity * unitPrice).toFixed(2)) // đúng như `roundMoney` của backend

export function toTransactionInput(
  values: TransactionFormValues,
  now: Date = new Date(),
): SupplierTransactionInput {
  const transactionDate = toTransactionDate(values.transactionDate, now)
  const note = values.note.trim()
  const extra = { transactionDate, ...(note !== '' ? { note } : {}) }
  if (values.type === 'PAYMENT')
    return { type: 'PAYMENT', amount: values.amount as number, ...extra }
  return {
    type: values.type,
    materialSlug: values.materialSlug,
    quantity: values.quantity as number,
    unitPrice: values.unitPrice as number,
    ...extra,
  }
}
