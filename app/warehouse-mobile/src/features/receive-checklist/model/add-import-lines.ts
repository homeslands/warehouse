import type { AvailableMaterial } from '@/entities/import-form'
import type { CurrentUser } from '@/entities/session'
import { fixedSupplierFor, newLocalLine } from './add-line'
import { useReceiveDraft } from './draft.store'
import { formSupplierSlug } from './form-supplier'

import { baseUnitOf } from './import-units'

/**
 * Thêm mỗi vật tư một dòng mặc định vào bản nháp phiếu nhập đang mở, theo thứ tự truyền vào: đơn vị gốc
 * (không có thì đơn vị đầu), số lượng 0, đơn giá 0 (để trống = 0 đ), chưa kiểm, kèm danh sách đơn vị để
 * đổi ngay trên dòng. Bên bán như `AddLineSheetScreen`: phiếu có "bên bán của phiếu" (`formSupplierSlug` —
 * phiếu mới: bên bán bước 1; phiếu đã có: chỉ khi `user` có `SUPPLIER_READ` và mọi dòng server cùng một bên bán) →
 * mọi dòng mang bên bán đó (`fixedSupplier`; backend tự gắn vật tư vào bên bán khi lưu). Không có → luật
 * `lineSupplier` của vật tư (không tạo liên kết mới). Tên bên bán tra MỘT lần (`supplierName`). Vật tư chưa
 * khai đơn vị / trùng khoá / bị bỏ qua (đang lưu) không thêm. Trả khoá các dòng đã thêm. Sức chứa (200 dòng)
 * do nơi gọi kiểm; mở sheet của dòng đầu do nơi gọi yêu cầu (`useLineFocus`).
 */
export function addImportLines(
  materials: readonly AvailableMaterial[],
  opts: { supplierName: (slug: string) => string | null; user: CurrentUser | null },
): string[] {
  const store = useReceiveDraft.getState()
  const draft = store.draft
  if (!draft) return []
  const headerSupplier = draft.header.supplierSlug
  const formSupplier = formSupplierSlug(draft, opts.user)
  const knownName = formSupplier ? opts.supplierName(formSupplier) : null
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
      fixedSupplier: fixedSupplierFor({
        formSupplier,
        material,
        lines: useReceiveDraft.getState().draft?.lines ?? draft.lines,
        knownName,
      }),
    })
    const result = store.addLine({ ...line, checked: false, units: material.units })
    if (result.ok) added.push(result.key)
  }
  return added
}
