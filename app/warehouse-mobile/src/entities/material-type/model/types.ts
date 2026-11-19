import type { CatalogItem } from '@/shared/lib/catalog'

export type MaterialType = CatalogItem & {
  createdAt: string
  updatedAt: string
}

export type MaterialTypeInput = { code: string; name: string; description?: string }
export type MaterialTypeUpdateInput = Partial<MaterialTypeInput>
