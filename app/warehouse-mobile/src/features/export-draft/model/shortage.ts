import type { InventoryItem, MaterialBatch } from '@/entities/inventory'
import { ceil6, floor6, round6 } from '@/shared/lib/round'

import type { ExportLine } from './draft'

/**
 * Số theo đơn vị của DÒNG (6 số lẻ). `stock`: thiếu bao nhiêu (làm tròn LÊN, tối thiểu 0,000001 —
 * không bao giờ "Thiếu 0"); `batch`: lô chọn chỉ còn bao nhiêu (làm tròn XUỐNG như "còn n").
 */
export type Shortage = { kind: 'stock'; missing: number } | { kind: 'batch'; available: number }

/** Số nhỏ nhất biểu diễn được ở 6 số lẻ. */
const MIN_QUANTITY = 0.000001

/** FEFO như backend: HSD sớm trước, không HSD cuối, rồi ngày nhập, rồi mã lô. */
function compareFefo(a: MaterialBatch, b: MaterialBatch): number {
  if (!a.expiryDate !== !b.expiryDate) return a.expiryDate ? -1 : 1
  if (a.expiryDate && b.expiryDate && a.expiryDate !== b.expiryDate)
    return a.expiryDate < b.expiryDate ? -1 : 1
  if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? -1 : 1
  return a.slug.localeCompare(b.slug)
}

/**
 * Mô phỏng giữ chỗ lúc gửi duyệt của backend để chỉ ra dòng nào thiếu hàng (theo vật tư, đơn vị
 * gốc): dòng chọn lô trừ vào lô đó trước, rồi dòng tự động lấy FEFO theo thứ tự dòng, và tổng không
 * được vượt `availableQuantity` của tồn (phần vượt gán vào dòng cuối của vật tư, nếu vật tư đó
 * chưa có dòng nào bị đánh dấu thiếu). Vật tư không có trong `stockBySlug` thì không kiểm cấp tồn.
 */
export function detectShortages(
  lines: ExportLine[],
  stockBySlug: Map<string, InventoryItem>,
  batchesBySlug: Map<string, MaterialBatch[]>,
): Map<string, Shortage> {
  const result = new Map<string, Shortage>()
  const byMaterial = new Map<string, ExportLine[]>()
  for (const line of lines) {
    const group = byMaterial.get(line.materialSlug)
    if (group) group.push(line)
    else byMaterial.set(line.materialSlug, [line])
  }

  for (const [materialSlug, group] of byMaterial) {
    const ordered = [...(batchesBySlug.get(materialSlug) ?? [])].sort(compareFefo)
    const free = new Map(ordered.map((b) => [b.slug, round6(b.availableQuantity)]))
    const base = (l: ExportLine) => round6(l.quantity * l.conversionRate)
    const missingInLineUnit = (l: ExportLine, qty: number) =>
      Math.max(MIN_QUANTITY, ceil6(qty / l.conversionRate))
    let flagged = false

    for (const line of group.filter((l) => l.batchSlug)) {
      const need = base(line)
      const have = free.get(line.batchSlug!) ?? 0
      if (have < need) {
        result.set(line.key, {
          kind: 'batch',
          available: Math.max(0, floor6(have / line.conversionRate)),
        })
        flagged = true
      } else free.set(line.batchSlug!, round6(have - need))
    }

    for (const line of group.filter((l) => !l.batchSlug)) {
      let need = base(line)
      for (const b of ordered) {
        if (need <= 0) break
        const have = free.get(b.slug)!
        if (have <= 0) continue
        const take = Math.min(have, need)
        free.set(b.slug, round6(have - take))
        need = round6(need - take)
      }
      if (need > 0) {
        result.set(line.key, { kind: 'stock', missing: missingInLineUnit(line, need) })
        flagged = true
      }
    }

    const stock = stockBySlug.get(materialSlug)
    if (stock && !flagged) {
      const total = round6(group.reduce((sum, l) => sum + base(l), 0))
      const over = round6(total - stock.availableQuantity)
      if (over > 0) {
        const last = group[group.length - 1]
        result.set(last.key, { kind: 'stock', missing: missingInLineUnit(last, over) })
      }
    }
  }
  return result
}
