import { normalizeForSearch } from '@/shared/lib/search'

import type { InventoryItem } from './types'
import { isOverMaximum, stockLevel } from './stock-level'

export type InventoryFilter = { query: string; level?: 'low' | 'high'; typeSlug?: string }

export function filterInventory(items: InventoryItem[], f: InventoryFilter): InventoryItem[] {
  const q = normalizeForSearch(f.query)
  const out: { item: InventoryItem; name: string }[] = []
  for (const item of items) {
    if (f.typeSlug && item.typeSlug !== f.typeSlug) continue
    if (f.level === 'low' && !(item.isBelowMinimum || stockLevel(item) === 'out')) continue
    if (f.level === 'high' && !isOverMaximum(item)) continue
    const name = normalizeForSearch(item.materialName)
    if (q && !name.includes(q) && !normalizeForSearch(item.materialCode).includes(q)) continue
    out.push({ item, name })
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return out.map((o) => o.item)
}

export function typesOf(items: InventoryItem[]): { slug: string; name: string }[] {
  const map = new Map<string, string>()
  for (const i of items) if (!map.has(i.typeSlug)) map.set(i.typeSlug, i.typeName)
  return [...map]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => normalizeForSearch(a.name).localeCompare(normalizeForSearch(b.name)))
}
