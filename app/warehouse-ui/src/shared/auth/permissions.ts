export type CurrentUser = {
  userId: string
  userName: string
  roleName: string
  scope: string
}

/**
 * Backend gom authority names rồi JSON.stringify thủ công vào `scope` (auth.utils.ts).
 * Không migration nào seed authority/permission, nên trên thực tế `scope` LUÔN là "[]".
 * Suy biến về mảng rỗng thay vì ném lỗi: một chuỗi hỏng không được phép làm trắng màn hình.
 */
export function safeParseScope(scope: string | null | undefined): string[] {
  if (!scope) return []

  try {
    const parsed: unknown = JSON.parse(scope)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export function hasRole(user: CurrentUser | null, ...roles: string[]): boolean {
  if (!user) return false
  return roles.includes(user.roleName)
}

/**
 * LUÔN trả false ở thời điểm hiện tại — backend chưa seed authority nào.
 * Không dùng làm cổng gác duy nhất cho bất kỳ thành phần UI nào. Dùng hasRole().
 */
export function can(user: CurrentUser | null, authority: string): boolean {
  if (!user) return false
  return safeParseScope(user.scope).includes(authority)
}
