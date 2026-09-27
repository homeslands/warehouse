/** `UserResponseDto` của backend. Không có tên người dùng — chỉ số điện thoại. */
export type User = {
  slug: string
  createdAt: string
  updatedAt: string
  phonenumber: string
  isActive: boolean
  roleSlug: string
  roleName: string
}

/** `RoleResponseDto`. `GET /roles` trả MẢNG THƯỜNG, không phân trang. */
export type Role = {
  slug: string
  createdAt?: string
  updatedAt?: string
  name: string
  description?: string
  authorityCodes: string[]
}

export type UserFilters = { roleSlug?: string }

/** Người có thể làm quản lý kho: đang hoạt động và mang vai trò MANAGER. */
export type ManagerCandidate = { slug: string; phonenumber: string }
