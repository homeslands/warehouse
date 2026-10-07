import { getData, getPaginated, patchData, postData, putData } from '@/shared/api/http'
import type { ListParams, Paginated } from '@/shared/api/types'
import type {
  ChangeUserRoleInput,
  ResetUserPasswordInput,
  Role,
  User,
  UserFilters,
  UserInput,
  UserUpdateInput,
} from '../model/types'

export const fetchUsers = (params: ListParams<UserFilters>): Promise<Paginated<User>> =>
  getPaginated<User>('/users', params)

/** `GET /roles` không phân trang — `getData`, không `getPaginated`. */
export const fetchRoles = (): Promise<Role[]> => getData<Role[]>('/roles')

export const createUser = (input: UserInput): Promise<User> => postData<User>('/users', input)

/**
 * Admin đặt mật khẩu hộ (`USER_CHANGE_PASSWORD`). Backend thu hồi mọi phiên của người bị đổi; token của người
 * gọi không đổi. Không trỏ vào chính mình (100408) — tự đổi đi `POST /auth/change-password`.
 */
export const resetUserPassword = (
  slug: string,
  input: ResetUserPasswordInput,
): Promise<{ userSlug: string }> =>
  postData<{ userSlug: string }>(`/users/${slug}/change-password`, input)

/** `USER_UPDATE` (cờ `userUpdate`). Sửa người khác: họ phải cấp thấp hơn; ADMIN không sửa ADMIN (100417). */
export const updateUser = (slug: string, input: UserUpdateInput): Promise<User> =>
  patchData<User>(`/users/${slug}`, input)

/**
 * `USER_UPDATE` (cờ `userStatus`). Khoá = `isActive = false` + thu hồi mọi phiên. Chặn: tự khoá (100414),
 * đang quản lý kho (100415), ADMIN↔ADMIN (100417). KHÔNG dùng `DELETE /users/{slug}` — đó là XOÁ.
 */
export const lockUser = (slug: string): Promise<User> => putData<User>(`/users/${slug}/lock`)

/** `USER_UPDATE`. Mở khoá người đang hoạt động là no-op. */
export const unlockUser = (slug: string): Promise<User> => putData<User>(`/users/${slug}/unlock`)

/** `USER_UPDATE`. Vai trò hiện tại lẫn vai trò mới phải thấp hơn người gọi; thu hồi mọi phiên của người đó. */
export const changeUserRole = (slug: string, input: ChangeUserRoleInput): Promise<User> =>
  postData<User>(`/users/${slug}/change-role`, input)
