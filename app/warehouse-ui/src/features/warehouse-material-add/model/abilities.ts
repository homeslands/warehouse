import { can, type CurrentUser } from '@/entities/session'
import type { MaterialAddAbilities } from '@/entities/inventory'

/** Luồng "thêm vật tư vào kho" trong sheet phiếu nhập — xem `MaterialAddAbilities` (`@/entities/inventory`). */
export function materialAddAbilities(user: CurrentUser | null): MaterialAddAbilities {
  const materialUpdate = can(user, 'MATERIAL_UPDATE')
  const warehouseUpdate = can(user, 'WAREHOUSE_UPDATE')
  const search = can(user, 'MATERIAL_READ')
  return {
    search,
    assign: materialUpdate && warehouseUpdate,
    create:
      search &&
      can(user, 'MATERIAL_CREATE') &&
      materialUpdate &&
      warehouseUpdate &&
      can(user, 'UNIT_READ'),
    attachSupplier: can(user, 'SUPPLIER_READ') && can(user, 'SUPPLIER_UPDATE') && materialUpdate,
  }
}
