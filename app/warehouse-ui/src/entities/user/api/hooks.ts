import { useQuery } from '@tanstack/react-query'
import { fetchRoles, fetchUsers } from './user.api'
import { roleKeys, userKeys } from './query-keys'
import type { ManagerCandidate } from '../model/types'

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
    .map((user) => ({ slug: user.slug, phonenumber: user.phonenumber }))

  return {
    candidates,
    isPending: rolesQuery.isPending || (managerRoleSlug !== undefined && usersQuery.isPending),
    isRoleMissing: rolesQuery.isSuccess && managerRoleSlug === undefined,
  }
}

/**
 * Danh sách role kèm `authorityCodes` đang được cấp. `GET /roles` trả **mọi** role kèm quyền trong
 * MỘT request, nên ma trận phân quyền không phải gọi `GET /roles/:slug` từng cái.
 */
export function useRoles() {
  return useQuery({ queryKey: roleKeys.all, queryFn: fetchRoles, staleTime: ROLES_STALE_TIME })
}
