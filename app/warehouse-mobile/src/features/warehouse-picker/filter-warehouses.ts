import type { UserWarehouse } from '@/entities/session'
import { normalizeForSearch } from '@/shared/lib/search'

/** Ô tìm kiếm chỉ đáng có khi danh sách đủ dài. */
export const SEARCH_MIN_WAREHOUSES = 6

export function shouldShowSearch(count: number): boolean {
  return count >= SEARCH_MIN_WAREHOUSES
}

/** Lọc theo tên hoặc mã, bỏ dấu tiếng Việt, không phân biệt hoa thường. Rỗng → giữ nguyên. */
export function filterWarehouses(list: UserWarehouse[], query: string): UserWarehouse[] {
  const q = normalizeForSearch(query)
  if (!q) return list
  return list.filter(
    (w) => normalizeForSearch(w.name).includes(q) || normalizeForSearch(w.code).includes(q),
  )
}
