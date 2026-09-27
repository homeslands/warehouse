import { ROLE_RANK, ROLES, type CurrentUser } from '@/entities/session'
import type { Role } from '@/entities/user'
import { PROTECTED_AUTHORITY_CODES } from '@/shared/api/authority-codes'

const MANAGE_PERMISSIONS = 'MANAGE_PERMISSIONS'
const PROTECTED = new Set<string>(PROTECTED_AUTHORITY_CODES)

/**
 * Vì sao một ô bị khoá. `rank` là cả CỘT (vai trò ngang/cao hơn mình) — màn vẽ cột đó ở dạng chỉ xem
 * thay vì một hàng switch xám.
 */
export type CellLock = 'protected' | 'rank' | 'notHeld' | 'lastKey'

function rankOf(roleName: string | undefined, unknown: number): number {
  return roleName !== undefined && roleName in ROLE_RANK
    ? ROLE_RANK[roleName as keyof typeof ROLE_RANK]
    : unknown
}

/**
 * Xếp vai trò từ cấp cao xuống cấp thấp (SUPER_ADMIN → ADMIN → MANAGER → SUPERVISOR) — ma trận đọc
 * theo đúng thứ bậc, dễ so ai hơn ai. Vai trò lạ xuống cuối, giữ thứ tự API (sort ổn định).
 */
export function sortRolesByRank(roles: readonly Role[]): Role[] {
  return [...roles].sort((a, b) => rankOf(b.name, -1) - rankOf(a.name, -1))
}

/**
 * R1 cho cả CỘT: người dùng không được sửa vai trò ngang hoặc cao hơn mình. SUPER_ADMIN được miễn.
 * Vai trò lạ: người gọi coi như thấp nhất, vai trò đích coi như cao nhất — khoá, không mở.
 */
export function isRankLocked(
  actor: CurrentUser | null,
  role: Role,
  delegationRules: boolean,
): boolean {
  if (!delegationRules || actor?.roleName === ROLES.SUPER_ADMIN) return false
  return rankOf(actor?.roleName, 0) <= rankOf(role.name, Infinity)
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
