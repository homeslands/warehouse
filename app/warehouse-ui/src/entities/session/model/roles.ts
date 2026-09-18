/** Khớp `RoleEnum` của backend (`warehouse-api/src/role/role.enum.ts`). */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SUPERVISOR: 'SUPERVISOR',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]
