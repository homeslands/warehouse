import { matchesSearch } from '@/shared/lib/search-text'
import type { InventoryItem } from '@/entities/inventory'

/** Số vật tư của kho form tải về để chọn / tìm (BE chưa có tìm theo mã / tên cho kho — spec §4.9). */
export const EXPORT_STOCK_SIZE = 500

/** Lọc tại chỗ theo mã hoặc tên, không phân biệt dấu / hoa thường; giữ thứ tự BE. Chuỗi trống → tất cả. */
export function filterStock(items: InventoryItem[], query: string): InventoryItem[] {
  if (query.trim() === '') return items
  return items.filter((i) => matchesSearch(`${i.materialCode} ${i.materialName}`, query))
}

/** Slug đơn vị gốc của vật tư trong kho; `''` nếu vật tư chưa khai đơn vị gốc. */
export function baseUnitSlugOf(item: Pick<InventoryItem, 'baseUnit' | 'units'>): string {
  return item.baseUnit?.slug ?? item.units.find((u) => u.isBaseUnit)?.unitSlug ?? ''
}
