import type { Material } from './types'

/** Đã có đơn vị gốc VÀ (có tồn kho hoặc đã có đơn vị quy đổi) → không đổi. Gốc đang null thì luôn cho đặt. */
export const isBaseUnitLocked = (m: Material): boolean =>
  m.baseUnit !== null && (m.warehouses.some((w) => w.quantity > 0) || m.units.length > 1)
