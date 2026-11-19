import type { CatalogItem } from '@/shared/lib/catalog'

export type Unit = CatalogItem & {
  createdAt: string
  updatedAt: string
  materialCount?: { asBaseUnit: number; asConversionUnit: number; total: number }
}

export type UnitInput = { code: string; name: string; description?: string }
export type UnitUpdateInput = Partial<UnitInput>
