import { format } from 'date-fns'
import type { MaterialBatch } from '@/entities/material-batch'
import { findShortages, type Shortage } from './availability'
import type { ExportFormValues } from './export-form-editor.schema'

type Stock = Parameters<typeof findShortages>[1]

export type ReviewWarning =
  | ({ kind: 'shortage' } & Shortage)
  | { kind: 'zeroPrice'; index: number }
  | { kind: 'expiredBatch'; index: number; expiryDate: string }

/**
 * Cần xem lại ở bước ③: `shortage` chặn gửi duyệt; `zeroPrice` (chỉ khi Bán) và `expiredBatch` (lô chọn tay đã hết hạn,
 * hạn = hôm nay chưa tính) là cảnh báo mềm. `now` truyền vào để hàm thuần.
 */
export function reviewExportForm(
  values: ExportFormValues,
  ctx: {
    stock: Stock
    batches: Map<string, Pick<MaterialBatch, 'availableQuantity' | 'expiryDate'>>
    now: Date
  },
): { warnings: ReviewWarning[] } {
  const warnings: ReviewWarning[] = findShortages(values.items, ctx.stock, ctx.batches).map(
    (s) => ({ kind: 'shortage', ...s }),
  )
  const today = format(ctx.now, 'yyyy-MM-dd')
  values.items.forEach((item, index) => {
    if (values.type === 'SALE' && item.unitPrice === 0) warnings.push({ kind: 'zeroPrice', index })
    const expiry = item.batchSlug ? ctx.batches.get(item.batchSlug)?.expiryDate : null
    if (expiry && expiry.slice(0, 10) < today) {
      warnings.push({ kind: 'expiredBatch', index, expiryDate: expiry })
    }
  })
  return { warnings }
}
