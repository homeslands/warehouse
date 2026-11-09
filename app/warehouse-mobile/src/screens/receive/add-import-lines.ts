import type { AvailableMaterial } from '@/entities/import-form'
import { newLocalLine, useReceiveDraft } from '@/features/receive-checklist'

import { baseUnitOf } from './import-units'

/**
 * Thêm mỗi vật tư một dòng mặc định vào bản nháp phiếu nhập đang mở, theo thứ tự truyền vào: đơn vị gốc
 * (không có thì đơn vị đầu), số lượng 0, đơn giá 0 (để trống = 0 đ), chưa kiểm, kèm danh sách đơn vị để
 * đổi ngay trên dòng. Bên bán như `AddLineSheetScreen`: phiếu mới đã chọn bên bán đầu phiếu → mọi dòng
 * mang bên bán đó (`fixedSupplier`), phiếu đã có → luật suy ra của vật tư. Vật tư chưa khai đơn vị /
 * trùng khoá / bị bỏ qua (đang lưu) không thêm. Trả khoá các dòng đã thêm. Sức chứa (200 dòng) do nơi
 * gọi kiểm; mở sheet của dòng đầu do nơi gọi yêu cầu (`useLineFocus`).
 */
export function addImportLines(
  materials: readonly AvailableMaterial[],
  opts: { isNew: boolean; supplierName: (slug: string) => string | null },
): string[] {
  const store = useReceiveDraft.getState()
  const headerSupplier = store.draft?.header.supplierSlug ?? null
  const added: string[] = []
  for (const material of materials) {
    const unit = baseUnitOf(material) ?? material.units[0]
    if (!unit) continue
    const line = newLocalLine({
      material,
      unit,
      quantity: 0,
      unitPrice: 0,
      headerSupplier,
      // Phiếu tạo trên máy đã chọn bên bán: mọi dòng mang bên bán đó (spec §5.4).
      fixedSupplier:
        opts.isNew && headerSupplier
          ? {
              slug: headerSupplier,
              name:
                opts.supplierName(headerSupplier) ??
                material.suppliers.find((s) => s.slug === headerSupplier)?.name ??
                null,
            }
          : undefined,
    })
    const result = store.addLine({ ...line, checked: false, units: material.units })
    if (result.ok) added.push(result.key)
  }
  return added
}
