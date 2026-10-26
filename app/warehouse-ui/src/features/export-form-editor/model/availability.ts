import type { InventoryItem } from '@/entities/inventory'
import type { MaterialBatch } from '@/entities/material-batch'
import type { ExportFormItemValues } from './export-form-editor.schema'

export type Shortage = {
  index: number
  available: number
  requested: number
  baseUnitCode: string | null
}

type Stock = Pick<InventoryItem, 'availableQuantity' | 'units' | 'baseUnit'>
type Batch = Pick<MaterialBatch, 'availableQuantity'>

/** Tránh sai số float khi cộng dồn / so sánh. */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6

type Group = { available: number; indexes: number[]; total: number }

/**
 * Dòng vượt khả dụng. Số lượng quy về đơn vị gốc rồi cộng dồn theo lô (dòng có lô) và theo vật tư (mọi dòng, kể cả
 * dòng có lô). Nhóm vượt thì MỌI dòng của nhóm bị báo; dòng thiếu ở cả hai nhóm mang nhóm chặt hơn (`available` nhỏ hơn).
 */
export function findShortages(
  items: ExportFormItemValues[],
  stock: Map<string, Stock>,
  batches: Map<string, Batch>,
): Shortage[] {
  const byMaterial = new Map<string, Group>()
  const byBatch = new Map<string, Group>()
  const baseUnitCodes = new Map<number, string | null>()

  const add = (
    map: Map<string, Group>,
    key: string,
    available: number,
    index: number,
    base: number,
  ) => {
    const group = map.get(key) ?? { available, indexes: [], total: 0 }
    group.indexes.push(index)
    group.total += base
    map.set(key, group)
  }

  items.forEach((item, index) => {
    const material = item.materialSlug ? stock.get(item.materialSlug) : undefined
    if (!material || !item.unitSlug) return
    if (typeof item.quantity !== 'number' || !(item.quantity > 0)) return
    const unit = material.units.find((u) => u.unitSlug === item.unitSlug)
    if (!unit) return

    const base = item.quantity * unit.conversionRate
    baseUnitCodes.set(index, material.baseUnit?.code ?? null)
    add(byMaterial, item.materialSlug, material.availableQuantity, index, base)
    const batch = item.batchSlug ? batches.get(item.batchSlug) : undefined
    if (batch) add(byBatch, item.batchSlug, batch.availableQuantity, index, base)
  })

  const found = new Map<number, Shortage>()
  for (const groups of [byMaterial, byBatch]) {
    for (const group of groups.values()) {
      const requested = round6(group.total)
      if (requested <= round6(group.available)) continue
      for (const index of group.indexes) {
        const current = found.get(index)
        if (current && current.available <= group.available) continue
        found.set(index, {
          index,
          available: group.available,
          requested,
          baseUnitCode: baseUnitCodes.get(index) ?? null,
        })
      }
    }
  }
  return [...found.values()].sort((a, b) => a.index - b.index)
}
