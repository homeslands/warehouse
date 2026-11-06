/** 3 family role của R2 (business-rules §22). Không có `SUPER_ADMIN` runtime. */
export const ROLE_FAMILIES = ['ADMIN', 'MANAGER', 'SUPERVISOR'] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export function isRoleFamily(value: unknown): value is RoleFamily {
  return typeof value === 'string' && (ROLE_FAMILIES as readonly string[]).includes(value);
}
