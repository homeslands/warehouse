import type { AuthorityCode } from '@/shared/api/authority-codes'
import type { ExportForm } from './types'

export type ExportFormAbilities = {
  /** Sửa phiếu: Nháp và (UPDATE_DRAFT, hoặc UPDATE_DRAFT_OWN + là người lập). Phiếu mới: CREATE. */
  canEdit: boolean
  /** Gửi duyệt (Nháp → Chờ duyệt): cùng điều kiện với sửa — backend tự check như PATCH. */
  canSubmit: boolean
  /** Xoá Nháp: DELETE_DRAFT, hoặc DELETE_DRAFT_OWN + là người lập. */
  canDelete: boolean
  /** Xác nhận xuất kho: Chờ duyệt + CONFIRM (+ APPROVE_DISPOSAL nếu là xuất huỷ). */
  canConfirm: boolean
  /** Huỷ phiếu: Nháp hoặc Chờ duyệt, cần CONFIRM. */
  canCancel: boolean
  /** Chờ duyệt, có CONFIRM nhưng thiếu APPROVE_DISPOSAL trên phiếu xuất huỷ → báo lý do thay vì ẩn nút. */
  confirmBlockedByDisposal: boolean
}

/**
 * Quyền của người dùng hiện tại, do nơi gọi dựng (entity chỉ import shared):
 * `{ can: (c) => can(user, c), userSlug: user.userSlug ?? null }`. SUPER_ADMIN do `can` của nơi gọi xử lý.
 */
export type ExportFormAccess = { can(code: AuthorityCode): boolean; userSlug: string | null }

export const canCreateExportForm = (access: ExportFormAccess): boolean =>
  access.can('EXPORT_FORM_CREATE')

/**
 * "Của mình" là luật mức bản ghi: so thẳng `userSlug`; phiên chưa có `userSlug` coi như không phải
 * của mình (ẩn nút an toàn hơn để người dùng bấm rồi ăn 403).
 */
export function exportFormAbilities(
  access: ExportFormAccess,
  form: Pick<ExportForm, 'status' | 'requesterSlug' | 'type'> | 'new',
): ExportFormAbilities {
  if (form === 'new') {
    const create = access.can('EXPORT_FORM_CREATE')
    return {
      canEdit: create,
      canSubmit: create,
      canDelete: false,
      canConfirm: false,
      canCancel: false,
      confirmBlockedByDisposal: false,
    }
  }

  const draft = form.status === 'DRAFT'
  const pending = form.status === 'PENDING'
  const own = access.userSlug !== null && form.requesterSlug === access.userSlug
  const canEdit =
    draft &&
    (access.can('EXPORT_FORM_UPDATE_DRAFT') || (access.can('EXPORT_FORM_UPDATE_DRAFT_OWN') && own))
  const canDelete =
    draft &&
    (access.can('EXPORT_FORM_DELETE_DRAFT') || (access.can('EXPORT_FORM_DELETE_DRAFT_OWN') && own))
  const confirm = access.can('EXPORT_FORM_CONFIRM')
  const disposalOk = form.type !== 'DISPOSAL' || access.can('EXPORT_FORM_APPROVE_DISPOSAL')

  return {
    canEdit,
    canSubmit: canEdit,
    canDelete,
    canConfirm: pending && confirm && disposalOk,
    canCancel: (draft || pending) && confirm,
    confirmBlockedByDisposal: pending && confirm && !disposalOk,
  }
}
