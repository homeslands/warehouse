import { normalizeForSearch } from './search'

export type CatalogItem = { slug: string; code: string; name: string; description?: string | null }

export type CatalogAbilities = { read: boolean; create: boolean; update: boolean; delete: boolean }

/** Query rỗng → tất cả; ngược lại giữ dòng có mã hoặc tên (không dấu, không phân biệt hoa thường) chứa query. */
export function filterCatalog<T extends CatalogItem>(items: readonly T[], query: string): T[] {
  const q = normalizeForSearch(query)
  if (q === '') return [...items]
  return items.filter(
    (i) => normalizeForSearch(i.code).includes(q) || normalizeForSearch(i.name).includes(q),
  )
}

export function sortByCode<T extends CatalogItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    a.code.localeCompare(b.code, 'vi', { numeric: true, sensitivity: 'base' }),
  )
}
