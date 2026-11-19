import type { CatalogAbilities } from '@/shared/lib/catalog'

export type MaterialRef = { slug: string; code: string; name: string }
export type MaterialUnit = {
  unitSlug: string
  unitCode: string
  unitName: string
  conversionRate: number
  isBaseUnit: boolean
}
export type MaterialWarehouse = MaterialRef & { quantity: number; availableQuantity: number }
export type Material = MaterialRef & {
  minimumInventory: number
  maximumInventory: number
  type: MaterialRef
  baseUnit: MaterialRef | null
  hasSupplier: boolean
  suppliers: MaterialRef[]
  warehouses: MaterialWarehouse[]
  units: MaterialUnit[]
  createdAt: string
  updatedAt: string
}
export type MaterialInput = {
  code: string
  name: string
  typeSlug: string
  baseUnitSlug: string
  minimumInventory?: number
  maximumInventory?: number
}
export type MaterialUpdateInput = Partial<MaterialInput>
export type MaterialListParams = { query: string; typeSlug?: string }
export type MaterialAbilities = CatalogAbilities & { manageConversions: boolean }
export type MaterialSearch =
  { kind: 'all' } | { kind: 'search'; name?: string; code?: string } | { kind: 'invalid' }
