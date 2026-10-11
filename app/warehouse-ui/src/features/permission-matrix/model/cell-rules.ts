import { ROLES, type CurrentUser } from '@/entities/session'
import { canManageTarget, sortRolesByLevel, type Role } from '@/entities/user'
import { PROTECTED_AUTHORITY_CODES } from '@/shared/api/authority-codes'

const MANAGE_PERMISSIONS = 'MANAGE_PERMISSIONS'
const PROTECTED = new Set<string>(PROTECTED_AUTHORITY_CODES)

/**
 * Vì sao một ô bị khoá. `rank` là cả CỘT (vai trò ngang/cao hơn mình) — màn vẽ cột đó ở dạng chỉ xem
 * thay vì một hàng switch xám.
 */
export type CellLock = 'protected' | 'rank' | 'notHeld' | 'lastKey'

/**
 * Xếp vai trò theo `level` thật, cấp cao trước (cùng thứ tự màn `/roles`) — vai trò tự tạo nằm đúng chỗ trong
 * thứ bậc. Không biết cấp → xuống cuối, giữ thứ tự API.
 */
export function sortRolesByRank(roles: readonly Role[]): Role[] {
  return sortRolesByLevel(roles)
}

/**
 * R1 cho cả CỘT: chỉ sửa vai trò có `level` THẤP HƠN mình (backend `RoleService.assertCanManage`). SUPER_ADMIN
 * được miễn. Không biết cấp của một bên (vai trò tự tạo thiếu `level`, phiên cũ) → khoá (fail-closed).
 */
export function isRankLocked(
  actor: CurrentUser | null,
  role: Role,
  delegationRules: boolean,
): boolean {
  if (!delegationRules || actor?.roleName === ROLES.SUPER_ADMIN) return false
  if (!actor) return true
  return !canManageTarget(actor, {
    roleName: role.name,
    role: role.level === undefined ? undefined : { level: role.level },
  })
}

/**
 * Ô (vai trò × mã) có sửa được không, theo đúng thứ tự backend kiểm: R3 → R1 → R2 → R4
 * (`docs/proposals/2026-09-25-permission-delegation-rules.md`). `null` = sửa được.
 *
 * SUPER_ADMIN được miễn R1–R3; R4 ("vai trò cuối cùng giữ quyền quản trị") áp cho mọi người và áp
 * cả khi cờ tắt — nó đã có từ trước luật ủy quyền.
 */
export function cellLock({
  actor,
  role,
  code,
  granted,
  manageHolderCount,
  delegationRules,
}: {
  actor: CurrentUser | null
  role: Role
  code: string
  /** Ô đang bật — tức bấm vào sẽ là GỠ. */
  granted: boolean
  /** Số vai trò đang giữ `MANAGE_PERMISSIONS`. */
  manageHolderCount: number
  delegationRules: boolean
}): CellLock | null {
  if (delegationRules && actor?.roleName !== ROLES.SUPER_ADMIN) {
    // R3
    if (PROTECTED.has(code)) return 'protected'
    // R1
    if (isRankLocked(actor, role, delegationRules)) return 'rank'
    // R2 — mặc định (a) đối xứng: áp cho cả cấp lẫn gỡ.
    if (!(actor?.scope ?? []).includes(code)) return 'notHeld'
  }
  // R4
  if (code === MANAGE_PERMISSIONS && granted && manageHolderCount <= 1) return 'lastKey'
  return null
}
