import type { AvailableMaterial, AvailableUnit } from '@/entities/import-form'

/** Đơn vị gốc của vật tư (cờ `isBaseUnit`, không có thì đơn vị trùng `baseUnitSlug`). */
export const baseUnitOf = (m: AvailableMaterial): AvailableUnit | undefined =>
  m.units.find((u) => u.isBaseUnit) ?? m.units.find((u) => u.unitSlug === m.baseUnitSlug)
