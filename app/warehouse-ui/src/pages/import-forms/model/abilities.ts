import { can, type CurrentUser } from '@/entities/session'
import type { ImportForm } from '@/entities/import-form'

export type ImportFormAbilities = {
  /** `POST` = IMPORT_FORM_CREATE; backend chặn kho inactive (101316) → FE khoá trước. */
  create: boolean
  /** `PATCH` = UPDATE_DRAFT, hoặc UPDATE_DRAFT_OWN + là người lập. Chỉ DRAFT. */
  update: boolean
  delete: boolean
  /** Xác nhận / huỷ = IMPORT_FORM_CONFIRM. Không chặn tự duyệt (docs/permissions.md). */
  confirm: boolean
  cancel: boolean
  /** IMPORT_FORM_EXPORT — FE tự in, mọi trạng thái. */
  print: boolean
}

type Ctx = {
  form?: Pick<ImportForm, 'status' | 'requesterSlug'>
  warehouseActive: boolean
}

/**
 * Luật "của mình" là luật mức bản ghi (service backend tự kiểm). `isSameUser` của `entities/user` cần
 * `phonenumber` mà phiếu không có → so thẳng `userSlug`; phiên cũ chưa có `userSlug` thì coi như không phải
 * của mình (ẩn nút — an toàn hơn để người dùng bấm rồi ăn 403).
 */
export function importFormAbilities(
  user: CurrentUser | null,
  { form, warehouseActive }: Ctx,
): ImportFormAbilities {
  const draft = form?.status === 'DRAFT'
  const own = Boolean(user?.userSlug) && form?.requesterSlug === user?.userSlug
  const fullOrOwn = (
    full: 'IMPORT_FORM_UPDATE_DRAFT' | 'IMPORT_FORM_DELETE_DRAFT',
    ownCode: 'IMPORT_FORM_UPDATE_DRAFT_OWN' | 'IMPORT_FORM_DELETE_DRAFT_OWN',
  ) => draft && (can(user, full) || (can(user, ownCode) && own))
  const decide = draft && can(user, 'IMPORT_FORM_CONFIRM')
  return {
    create: can(user, 'IMPORT_FORM_CREATE') && warehouseActive,
    update: fullOrOwn('IMPORT_FORM_UPDATE_DRAFT', 'IMPORT_FORM_UPDATE_DRAFT_OWN'),
    delete: fullOrOwn('IMPORT_FORM_DELETE_DRAFT', 'IMPORT_FORM_DELETE_DRAFT_OWN'),
    confirm: decide,
    cancel: decide,
    print: can(user, 'IMPORT_FORM_EXPORT'),
  }
}
