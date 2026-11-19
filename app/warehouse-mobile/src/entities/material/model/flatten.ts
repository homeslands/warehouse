import type { Paginated } from '@/shared/api/types'
import type { Material } from './types'

/** Nối các trang, khử trùng theo `slug` (giữ lần đầu). */
export function flattenMaterialPages(pages: Paginated<Material>[]): Material[] {
  const seen = new Set<string>()
  return pages
    .flatMap((p) => p.items)
    .filter((m) => {
      if (seen.has(m.slug)) return false
      seen.add(m.slug)
      return true
    })
}
