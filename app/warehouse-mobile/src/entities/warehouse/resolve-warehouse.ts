import type { UserWarehouse } from '@/entities/session'

export type WarehouseResolution =
  { kind: 'selected'; warehouse: UserWarehouse } | { kind: 'choose' } | { kind: 'none' }

// Hàm thuần: quyết định kho hiện tại từ danh sách kho của user và kho dùng lần trước.
export function resolveWarehouse(
  warehouses: UserWarehouse[],
  lastSlug: string | null,
): WarehouseResolution {
  if (warehouses.length === 0) return { kind: 'none' }
  const last = lastSlug ? warehouses.find((x) => x.slug === lastSlug) : undefined
  if (last) return { kind: 'selected', warehouse: last }
  if (warehouses.length === 1) return { kind: 'selected', warehouse: warehouses[0] }
  return { kind: 'choose' }
}
