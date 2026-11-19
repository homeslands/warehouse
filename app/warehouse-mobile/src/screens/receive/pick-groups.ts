import type { AvailableMaterial } from '@/entities/import-form'
import type { Material } from '@/entities/material'
import { filterCatalog } from '@/shared/lib/catalog'

/**
 * Lọc vật tư theo mã / tên (không dấu, không phân biệt hoa thường) rồi chia hai nhóm: "mine" = vật tư mà
 * bên bán `supplierSlug` đã bán (có trong `suppliers`), "others" = còn lại. Giữ thứ tự đầu vào;
 * `supplierSlug` null → mọi thứ vào `others`.
 */
export function splitBySupplier(
  items: readonly AvailableMaterial[],
  supplierSlug: string | null,
  query: string,
): { mine: AvailableMaterial[]; others: AvailableMaterial[] } {
  const mine: AvailableMaterial[] = []
  const others: AvailableMaterial[] = []
  for (const m of filterCatalog(items, query)) {
    if (supplierSlug !== null && m.suppliers.some((s) => s.slug === supplierSlug)) mine.push(m)
    else others.push(m)
  }
  return { mine, others }
}

/**
 * Nhóm "Chưa có trong kho": kết quả tìm danh mục loại vật tư đã ở kho hiện tại (theo `warehouses` của vật tư)
 * và vật tư đã có trong danh sách khả dụng của kho (`availableSlugs`) — hai lớp, phòng danh sách lệch nhau.
 */
export function notInWarehouse(
  items: readonly Material[],
  warehouseSlug: string,
  availableSlugs: ReadonlySet<string>,
): Material[] {
  return items.filter(
    (m) => !m.warehouses.some((w) => w.slug === warehouseSlug) && !availableSlugs.has(m.slug),
  )
}

/** Vật tư danh mục → thẻ của sheet chọn: tồn 0, NCC THẬT của vật tư, thiếu đơn vị gốc → `baseUnitSlug` null. */
export function catalogToAvailable(m: Material): AvailableMaterial {
  return {
    slug: m.slug,
    code: m.code,
    name: m.name,
    baseUnitSlug: m.baseUnit?.slug ?? null,
    quantity: 0,
    suppliers: m.suppliers.map((s) => ({ slug: s.slug, code: s.code, name: s.name })),
    units: m.units.map((u) => ({ ...u })),
  }
}
