import type { AvailableMaterial } from '@/entities/import-form'
import { can, type CurrentUser } from '@/entities/session'

import type { LocalLine, ReceiveDraft } from './draft'

/**
 * "Bên bán của phiếu" cho việc thêm dòng / chia nhóm bộ chọn / gợi ý gắn — CHỈ khi chắc chắn, vì dòng
 * mới mang bên bán này và backend gắn vĩnh viễn vật tư ↔ bên bán khi lưu:
 * - phiếu mới (`formSlug === 'new'`): bên bán đã chọn ở bước 1 (`header.supplierSlug`);
 * - phiếu đã có: người dùng có `SUPPLIER_READ` (như web: chỉ suy ra đầu phiếu khi `canPickSupplier`) VÀ
 *   mọi dòng CỦA SERVER (`base !== null`) có bên bán đều cùng MỘT bên bán (≥ 1 dòng như vậy) → bên bán đó.
 *   Dòng thêm trên máy không tính: dòng đoán theo `lineSupplier` (phiếu chưa có bên bán chắc chắn) không
 *   được kéo các dòng thêm sau theo bên bán đó; dòng thêm khi đã chắc thì vốn mang đúng bên bán này.
 * Còn lại `null` → dòng mới theo luật `lineSupplier`, bộ chọn một danh sách, không gợi ý.
 * KHÔNG thay `header.supplierSlug` (vẫn là kết quả `deriveHeaderSupplier` cho dòng Bên bán / gộp).
 */
export function formSupplierSlug(
  draft: Pick<ReceiveDraft, 'formSlug' | 'header'> & {
    lines: readonly Pick<LocalLine, 'base' | 'supplierSlug'>[]
  },
  user: CurrentUser | null,
): string | null {
  if (draft.formSlug === 'new') return draft.header.supplierSlug
  if (!can(user, 'SUPPLIER_READ')) return null
  let only: string | null = null
  for (const l of draft.lines) {
    if (l.base === null || l.supplierSlug === null) continue
    if (only === null) only = l.supplierSlug
    else if (only !== l.supplierSlug) return null
  }
  return only
}

/**
 * Lưu phiếu sẽ gắn vật tư của dòng vào bên bán CỦA DÒNG (thứ thật sự được gửi): dòng thêm trên máy
 * (`materialSupplierSlugs` có) mang bên bán mà vật tư chưa có. Dòng server / bản nháp cũ → false.
 */
export function willAttachToSupplier(
  line: Pick<LocalLine, 'supplierSlug' | 'materialSupplierSlugs'>,
): boolean {
  return (
    line.supplierSlug !== null &&
    line.materialSupplierSlugs !== undefined &&
    !line.materialSupplierSlugs.includes(line.supplierSlug)
  )
}

/**
 * Tra tên bên bán theo slug: danh sách bên bán (cache `useSuppliers`) → dòng của phiếu cùng slug có tên
 * → `suppliers` của vật tư (bộ chọn) → `null`. Không suy lại từ "bên bán đầu phiếu".
 */
export function supplierNameLookup({
  suppliers,
  lines,
  materials,
}: {
  suppliers?: readonly { slug: string; name: string }[] | null
  lines?: readonly Pick<LocalLine, 'supplierSlug' | 'supplierName'>[] | null
  materials?: readonly Pick<AvailableMaterial, 'suppliers'>[] | null
}): (slug: string) => string | null {
  return (slug) =>
    suppliers?.find((s) => s.slug === slug)?.name ??
    lines?.find((l) => l.supplierSlug === slug && l.supplierName)?.supplierName ??
    materials?.flatMap((m) => m.suppliers).find((s) => s.slug === slug)?.name ??
    null
}
