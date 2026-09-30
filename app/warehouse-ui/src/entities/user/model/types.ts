/**
 * `UserResponseDto` của backend. `firstName` / `lastName` có từ migration thêm hồ sơ — tài khoản cũ để
 * chuỗi rỗng (cột mặc định `''`), nên luôn phải có đường lùi về số điện thoại (`formatPersonLabel`, `shared/lib/person-name.ts`).
 */
export type User = {
  slug: string
  createdAt: string
  updatedAt: string
  phonenumber: string
  firstName?: string
  lastName?: string
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
export type ManagerCandidate = Pick<User, 'slug' | 'phonenumber' | 'firstName' | 'lastName'>
