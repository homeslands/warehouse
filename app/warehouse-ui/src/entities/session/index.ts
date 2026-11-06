export { useAuthStore, setCacheCleaner } from './model/auth.store'
export type { AuthStatus } from './model/auth.store'
export { useSession } from './model/useSession'
export { usePermissionSync } from './model/usePermissionSync'
export { hasRole, can, safeParseScope } from './model/permissions'
export { refreshCurrentUser } from './model/refresh-user'
export type { CurrentUser } from './model/permissions'
export { ROLES, ROLE_RANK, WAREHOUSE_SCOPED_ROLES, isWarehouseScoped } from './model/roles'
export { useRoleLabel } from './model/role-label'
export type { Role } from './model/roles'
export { useProfile, useUpdateProfile, useAuthSessions, useRevokeSession } from './api/hooks'
export { sessionKeys } from './api/query-keys'
export type { Profile, UpdateProfileInput, AuthSession } from './model/types'

// Phiên API v1 (#242 M02) — chỉ dùng khi cờ `apiV1Auth` bật.
export {
  identityOf,
  injectSessionV1,
  initialV1SessionState,
  selectSessionV1,
  sessionRefreshed,
  sessionV1Slice,
} from './model/v1/session-v1.slice'
export type { V1Identity, V1SessionState, V1SessionStatus } from './model/v1/session-v1.slice'
export {
  endV1Session,
  lockV1,
  loginV1,
  logoutAllV1,
  logoutV1,
  restoreV1Session,
} from './model/v1/session-v1.thunks'
export {
  ACTIVITY_REPORT_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  startActivityTracker,
} from './model/v1/activity-tracker'
export { useSessionActivityV1, useSessionV1 } from './model/v1/hooks'
