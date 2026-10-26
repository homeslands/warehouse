import { can, type CurrentUser } from '@/entities/session'
import type { ExportForm } from '@/entities/export-form'

export type ExportFormAbilities = {
  /**
   * `POST` = EXPORT_FORM_CREATE, kho đang hoạt động. Còn cần MATERIAL_READ + WAREHOUSE_READ (Ruling 2): form tải
   * `GET /warehouses/{w}/materials` để chọn vật tư — thiếu thì ẩn nút để người dùng không vào một form không chọn
   * được vật tư.
   */
  create: boolean
  /** `PATCH` = UPDATE_DRAFT, hoặc UPDATE_DRAFT_OWN + là người lập. Chỉ DRAFT. Cần thêm quyền đọc vật tư như `create`. */
  update: boolean
  /** `DELETE` = DELETE_DRAFT, hoặc DELETE_DRAFT_OWN + là người lập. Chỉ DRAFT. */
  delete: boolean
  /** `POST /submit` — BE kiểm như quyền sửa (không cần đọc vật tư: hộp gửi duyệt không tải gì). Chỉ DRAFT. */
  submit: boolean
  /** PENDING + EXPORT_FORM_CONFIRM; phiếu Xuất huỷ cần thêm EXPORT_FORM_APPROVE_DISPOSAL. Không chặn tự duyệt. */
  confirm: boolean
  /** DRAFT / PENDING + EXPORT_FORM_CONFIRM — SUPERVISOR không huỷ được nháp của mình (chỉ Xoá). */
  cancel: boolean
  /** EXPORT_FORM_EXPORT — FE tự in, mọi trạng thái. */
  print: boolean
  /** EXPORT_FORM_CONFIRM, không xét phiếu: sheet có "Gửi & xác nhận" (`canConfirm`). */
  confirmOnSave: boolean
  /** EXPORT_FORM_APPROVE_DISPOSAL, không xét phiếu: sheet cho "Gửi & xác nhận" phiếu Xuất huỷ (`canApproveDisposal`). */
  approveDisposal: boolean
  /** MATERIAL_READ + WAREHOUSE_READ: `GET material-batches` — chọn lô tay (`canPickBatch`). */
  pickBatch: boolean
  /** WAREHOUSE_READ: Chuyển kho chọn kho đích từ danh sách (`canReadWarehouses`). */
  readWarehouses: boolean
  /**
   * PENDING + EXPORT_FORM_CONFIRM + Xuất huỷ mà thiếu APPROVE_DISPOSAL: hiện nút Xác nhận bị khoá kèm lý do, thay vì
   * giấu nút (người có quyền duyệt thường biết có việc chờ mà không hiểu vì sao không làm được).
   */
  disposalBlocked: boolean
}

type Ctx = {
  form?: Pick<ExportForm, 'status' | 'requesterSlug' | 'type'>
  warehouseActive: boolean
}

/**
 * Luật "của mình" là luật mức bản ghi (service backend tự kiểm) — so thẳng `userSlug` như phiếu nhập; phiên cũ chưa
 * có `userSlug` thì coi như không phải của mình (ẩn nút — an toàn hơn để người dùng bấm rồi ăn 403).
 */
export function exportFormAbilities(
  user: CurrentUser | null,
  { form, warehouseActive }: Ctx,
): ExportFormAbilities {
  const draft = form?.status === 'DRAFT'
  const pending = form?.status === 'PENDING'
  const own = Boolean(user?.userSlug) && form?.requesterSlug === user?.userSlug
  const fullOrOwn = (
    full: 'EXPORT_FORM_UPDATE_DRAFT' | 'EXPORT_FORM_DELETE_DRAFT',
    ownCode: 'EXPORT_FORM_UPDATE_DRAFT_OWN' | 'EXPORT_FORM_DELETE_DRAFT_OWN',
  ) => draft && (can(user, full) || (can(user, ownCode) && own))
  const readMaterials = can(user, 'MATERIAL_READ') && can(user, 'WAREHOUSE_READ')
  const canDecide = can(user, 'EXPORT_FORM_CONFIRM')
  const approveDisposal = can(user, 'EXPORT_FORM_APPROVE_DISPOSAL')
  const disposal = form?.type === 'DISPOSAL'
  const submit = fullOrOwn('EXPORT_FORM_UPDATE_DRAFT', 'EXPORT_FORM_UPDATE_DRAFT_OWN')
  return {
    create: can(user, 'EXPORT_FORM_CREATE') && warehouseActive && readMaterials,
    update: submit && readMaterials,
    delete: fullOrOwn('EXPORT_FORM_DELETE_DRAFT', 'EXPORT_FORM_DELETE_DRAFT_OWN'),
    submit,
    confirm: pending && canDecide && (!disposal || approveDisposal),
    cancel: (draft || pending) && canDecide,
    print: can(user, 'EXPORT_FORM_EXPORT'),
    confirmOnSave: canDecide,
    approveDisposal,
    pickBatch: readMaterials,
    readWarehouses: can(user, 'WAREHOUSE_READ'),
    disposalBlocked: pending && canDecide && disposal && !approveDisposal,
  }
}
