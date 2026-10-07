import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { isApiError } from '@/shared/api/http'
import type { ApiError, ListParams } from '@/shared/api/types'
import {
  createUser,
  fetchRoles,
  fetchUsers,
  resetUserPassword,
  changeUserRole,
  lockUser,
  unlockUser,
  updateUser,
} from './user.api'
import { roleKeys, userKeys } from './query-keys'
import type {
  ManagerCandidate,
  ResetUserPasswordInput,
  User,
  UserFilters,
  UserInput,
  UserUpdateInput,
} from '../model/types'

/** Tên vai trò quản lý kho ở backend (`RoleEnum.Manager`). */
const MANAGER_ROLE_NAME = 'MANAGER'

/**
 * Danh sách vai trò. `staleTime` dài vì vai trò gần như không đổi trong một phiên làm việc, và
 * mỗi lần mở ô chọn quản lý đều cần nó — không để hai request nối nhau lặp lại mỗi lần mở.
 */
const ROLES_STALE_TIME = 30 * 60 * 1000

/**
 * `GET /users` chỉ lọc theo `roleSlug` (chuỗi ngẫu nhiên), không lọc theo `roleName`. Nên phải
 * tra vai trò trước rồi mới lấy người: hai request nối nhau, request sau `enabled` khi có slug.
 * Tải hết `/users` rồi lọc theo `roleName` ở client sẽ thiếu người khi có nhiều trang.
 *
 * Trả `isRoleMissing` để giao diện nói rõ "chưa có vai trò MANAGER" thay vì hiện ô chọn rỗng
 * trông như đang lỗi. Chỉ kết luận khi `/roles` đã về THÀNH CÔNG — tải hỏng là chuyện khác hẳn,
 * nói "chưa có vai trò" lúc đó là báo sai và còn khoá luôn ô chọn.
 */
export function useManagerCandidates(): {
  candidates: ManagerCandidate[]
  isPending: boolean
  isRoleMissing: boolean
} {
  const rolesQuery = useQuery({
    queryKey: roleKeys.all,
    queryFn: fetchRoles,
    staleTime: ROLES_STALE_TIME,
  })

  const managerRoleSlug = rolesQuery.data?.find((role) => role.name === MANAGER_ROLE_NAME)?.slug

  // `size` lớn: ô chọn phải thấy đủ người, không phân trang được trong một combobox. Số quản lý
  // của một doanh nghiệp nhỏ hơn con số này rất nhiều.
  const usersQuery = useQuery({
    queryKey: userKeys.list({ page: 1, size: 100, roleSlug: managerRoleSlug }),
    queryFn: () => fetchUsers({ page: 1, size: 100, roleSlug: managerRoleSlug }),
    enabled: managerRoleSlug !== undefined,
  })

  // Backend từ chối gán người đang bị khoá (100515) — đừng mời người dùng chọn rồi mới báo lỗi.
  const candidates = (usersQuery.data?.items ?? [])
    .filter((user) => user.isActive)
    .map((user) => ({
      slug: user.slug,
      phonenumber: user.phonenumber,
      firstName: user.firstName,
      lastName: user.lastName,
    }))

  return {
    candidates,
    isPending: rolesQuery.isPending || (managerRoleSlug !== undefined && usersQuery.isPending),
    isRoleMissing: rolesQuery.isSuccess && managerRoleSlug === undefined,
  }
}

/**
 * Danh sách role kèm `authorityCodes` đang được cấp. `GET /roles` trả **mọi** role kèm quyền trong
 * MỘT request, nên ma trận phân quyền không phải gọi `GET /roles/:slug` từng cái.
 *
 * `enabled: false` khi người xem không có `ROLE_READ` (vd MANAGER ở màn người dùng) — không bắn request
 * chắc chắn 403.
 */
export function useRoles(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: roleKeys.all,
    queryFn: fetchRoles,
    staleTime: ROLES_STALE_TIME,
    enabled: options.enabled ?? true,
  })
}

/** Một trang người dùng. Chuyển trang vẫn hiện trang cũ tới khi trang mới về. */
export function useUsers(params: ListParams<UserFilters>) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => fetchUsers(params),
    placeholderData: keepPreviousData,
  })
}

/** Cũng làm mới `useManagerCandidates` (ô chọn quản lý kho) — cùng gốc `userKeys.all`. */
function useInvalidateUsers() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: userKeys.all })
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  const { t } = useTranslation(['users'])

  return useMutation<User, ApiError, UserInput>({
    mutationFn: createUser,
    // Form tự báo lỗi tại ô (SĐT trùng / sai, email, ngày sinh, vai trò).
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('users:created'))
      invalidate()
    },
  })
}

/** Mã backend khi người đích không còn (bị xoá ở nơi khác). */
const USER_NOT_FOUND_CODE = 100405

export function useResetUserPassword() {
  const invalidate = useInvalidateUsers()
  const { t } = useTranslation(['users'])

  return useMutation<
    { userSlug: string },
    ApiError,
    { slug: string; input: ResetUserPasswordInput }
  >({
    mutationFn: ({ slug, input }) => resetUserPassword(slug, input),
    // Dialog tự báo lỗi (ô mật khẩu hoặc toast).
    meta: { suppressErrorToast: true },
    // Danh sách không đổi khi đổi mật khẩu — không tải lại.
    onSuccess: () => toast.success(t('users:passwordReset')),
    // Người đích đã biến mất → dòng đang hiện là dữ liệu cũ.
    onError: (error) => {
      if (isApiError(error) && error.code === USER_NOT_FOUND_CODE) invalidate()
    },
  })
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers()
  const { t } = useTranslation(['users'])

  return useMutation<User, ApiError, { slug: string; input: UserUpdateInput }>({
    mutationFn: ({ slug, input }) => updateUser(slug, input),
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('users:updated'))
      invalidate()
    },
  })
}

/** Lỗi (tự khoá, đang quản lý kho, ADMIN↔ADMIN) để chốt toast chung báo — hộp xác nhận không có ô gắn lỗi. */
export function useSetUserActive() {
  const invalidate = useInvalidateUsers()
  const { t } = useTranslation(['users'])

  return useMutation<User, ApiError, { slug: string; isActive: boolean }>({
    mutationFn: ({ slug, isActive }) => (isActive ? unlockUser(slug) : lockUser(slug)),
    onSuccess: (_user, { isActive }) => {
      toast.success(t(isActive ? 'users:unlocked' : 'users:locked'))
      invalidate()
    },
  })
}

export function useChangeUserRole() {
  const invalidate = useInvalidateUsers()
  const { t } = useTranslation(['users'])

  return useMutation<User, ApiError, { slug: string; roleSlug: string }>({
    mutationFn: ({ slug, roleSlug }) => changeUserRole(slug, { roleSlug }),
    // Dialog tự báo lỗi tại ô chọn vai trò (100104 / 100101 / 100417).
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      toast.success(t('users:roleChanged'))
      invalidate()
    },
  })
}
