import type { AuthorityCode } from '@/shared/api/authority-codes'
import type { ImportForm } from './types'

export type ImportFormAbilities = {
  /** Lưu: Nháp và (UPDATE_DRAFT, hoặc UPDATE_DRAFT_OWN + là người lập). Phiếu mới: IMPORT_FORM_CREATE. */
  canEdit: boolean
  /** [+ Thêm]: quyền sửa VÀ IMPORT_FORM_CREATE (available-materials gác bằng quyền này). */
  canAddLine: boolean
  /** Xác nhận: Nháp (hoặc phiếu mới có quyền tạo) và IMPORT_FORM_CONFIRM. */
  canConfirm: boolean
  /** Huỷ phiếu: Nháp và IMPORT_FORM_CONFIRM (phiếu mới: không). */
  canCancel: boolean
  /** Xoá Nháp: DELETE_DRAFT, hoặc DELETE_DRAFT_OWN + là người lập (phiếu mới: không). */
  canDelete: boolean
}

/**
 * Quyền của người dùng hiện tại, do nơi gọi dựng (entity chỉ import shared):
 * `{ can: (c) => can(user, c), userSlug: user.userSlug ?? null }`. SUPER_ADMIN do `can` của nơi gọi xử lý.
 */
export type ImportFormAccess = { can(code: AuthorityCode): boolean; userSlug: string | null }

export const canCreateImportForm = (access: ImportFormAccess): boolean =>
  access.can('IMPORT_FORM_CREATE')

/**
 * "Của mình" là luật mức bản ghi: so thẳng `userSlug`; phiên chưa có `userSlug` coi như không phải
 * của mình (ẩn nút an toàn hơn để người dùng bấm rồi ăn 403).
 */
export function importFormAbilities(
  access: ImportFormAccess,
  form: Pick<ImportForm, 'status' | 'requesterSlug'> | 'new',
): ImportFormAbilities {
  const create = access.can('IMPORT_FORM_CREATE')
  const confirm = access.can('IMPORT_FORM_CONFIRM')

  if (form === 'new') {
    return {
      canEdit: create,
      canAddLine: create,
      canConfirm: create && confirm,
      canCancel: false,
      canDelete: false,
    }
  }

  const draft = form.status === 'DRAFT'
  const own = access.userSlug !== null && form.requesterSlug === access.userSlug
  const canEdit =
    draft &&
    (access.can('IMPORT_FORM_UPDATE_DRAFT') || (access.can('IMPORT_FORM_UPDATE_DRAFT_OWN') && own))
  const canDelete =
    draft &&
    (access.can('IMPORT_FORM_DELETE_DRAFT') || (access.can('IMPORT_FORM_DELETE_DRAFT_OWN') && own))
  return {
    canEdit,
    canAddLine: canEdit && create,
    canConfirm: draft && confirm,
    canCancel: draft && confirm,
    canDelete,
  }
}

/**
 * Màn kiểm / sửa phiếu (`/import/[formSlug]/receive`) theo quyền trên MỘT phiếu:
 * - `'check'`: được xác nhận (`canConfirm`) → checklist kiểm hàng (đánh dấu khớp, bộ lọc, Xác nhận).
 * - `'edit'`: không xác nhận được nhưng sửa được → "Sửa phiếu": sửa số / hạn / ghi chú, thêm dòng,
 *   Lưu; KHÔNG có dấu đã kiểm (dấu chỉ nằm trên máy, người xác nhận không thấy và tự kiểm lại trên
 *   máy mình trước khi xác nhận — chốt 2026-11-05).
 * - `'view'`: không sửa, không xác nhận → chỉ xem (màn xem không mở tới đây).
 */
export type ReceiveMode = 'check' | 'edit' | 'view'

export function receiveMode(abilities: ImportFormAbilities): ReceiveMode {
  if (abilities.canConfirm) return 'check'
  return abilities.canEdit ? 'edit' : 'view'
}
