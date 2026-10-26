export const materialBatchKeys = {
  all: ['material-batches'] as const,
  warehouse: (warehouseSlug: string) => [...materialBatchKeys.all, warehouseSlug] as const,
  material: (warehouseSlug: string, materialSlug: string) =>
    [...materialBatchKeys.warehouse(warehouseSlug), 'material', materialSlug] as const,
}
