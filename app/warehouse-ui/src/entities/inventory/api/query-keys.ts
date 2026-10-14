export const inventoryKeys = {
  all: ['inventory'] as const,
  warehouse: (warehouseSlug: string) => [...inventoryKeys.all, warehouseSlug] as const,
}
