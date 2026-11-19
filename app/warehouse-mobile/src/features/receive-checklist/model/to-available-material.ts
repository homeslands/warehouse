import type { AvailableMaterial, AvailableSupplier } from '@/entities/import-form'
import type { InventoryItem } from '@/entities/inventory'

/**
 * Dòng tồn vừa tạo (`POST /warehouses/:w/materials`) → vật tư của bộ chọn để `addImportLines` thêm dòng.
 * Vật tư mới nên tồn 0; `suppliers` chỉ có bên bán của phiếu (đã gắn cùng lần tạo), `units` giữ nguyên.
 */
export function toAvailableMaterial(
  item: InventoryItem,
  supplier?: AvailableSupplier,
): AvailableMaterial {
  return {
    slug: item.materialSlug,
    code: item.materialCode,
    name: item.materialName,
    baseUnitSlug: item.baseUnit?.slug ?? null,
    quantity: 0,
    suppliers: supplier ? [supplier] : [],
    units: item.units.map((u) => ({
      unitSlug: u.unitSlug,
      unitCode: u.unitCode,
      unitName: u.unitName,
      conversionRate: u.conversionRate,
      isBaseUnit: u.isBaseUnit,
    })),
  }
}
