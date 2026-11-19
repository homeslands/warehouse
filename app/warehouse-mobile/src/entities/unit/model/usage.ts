import type { Unit } from './types'

/** `total` do backend đếm riêng (một vật tư có thể dùng đơn vị ở cả hai vai) nên không cộng base + conversion. */
export function unitUsage(unit: Pick<Unit, 'materialCount'>): {
  base: number
  conversion: number
  total: number
} {
  const c = unit.materialCount
  if (!c) return { base: 0, conversion: 0, total: 0 }
  return {
    base: c.asBaseUnit,
    conversion: Math.max(0, c.asConversionUnit - c.asBaseUnit),
    total: c.total,
  }
}
