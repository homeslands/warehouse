import type { InventoryItem, MaterialBatch } from '@/entities/inventory'
import { floor6, round6 } from '@/shared/lib/round'

import type { ExportLine } from './draft'

/**
 * Khả dụng còn lại cho dòng này, theo đơn vị của dòng (6 số lẻ, làm tròn XUỐNG để nhập đúng số này
 * không bao giờ vượt; không âm), sau khi trừ các dòng KHÁC
 * cùng vật tư trên phiếu (quy về đơn vị gốc bằng `conversionRate` của từng dòng).
 * - Dòng đã chọn lô: dùng `availableQuantity` của lô (cần `batch` đúng lô đó, không thì `null`) và
 *   chỉ trừ các dòng khác cùng lô.
 * - Dòng lô tự động: dùng `availableQuantity` của tồn và trừ mọi dòng khác cùng vật tư.
 * `null` = không biết (chưa có tồn / lô).
 */
export function availableInLineUnit(
  line: ExportLine,
  stock: InventoryItem | undefined,
  batch: MaterialBatch | undefined,
  otherLines: readonly ExportLine[],
): number | null {
  const byBatch = line.batchSlug !== null
  let availableBase: number
  if (byBatch) {
    if (!batch || batch.slug !== line.batchSlug) return null
    availableBase = batch.availableQuantity
  } else {
    if (!stock) return null
    availableBase = stock.availableQuantity
  }
  let usedByOthers = 0
  for (const o of otherLines) {
    if (o === line || o.key === line.key || o.materialSlug !== line.materialSlug) continue
    if (byBatch && o.batchSlug !== line.batchSlug) continue
    usedByOthers = round6(usedByOthers + o.quantity * o.conversionRate)
  }
  return Math.max(0, floor6((availableBase - usedByOthers) / line.conversionRate))
}
