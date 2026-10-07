export type UserRole = { slug: string; name: string; description?: string; level: number }

export type UserWarehouse = { slug: string; code: string; name: string }

/**
 * `UserResponseDto` của backend. `firstName` / `lastName` có từ migration thêm hồ sơ — tài khoản cũ để
 * chuỗi rỗng (cột mặc định `''`), nên luôn phải có đường lùi về số điện thoại (`formatPersonLabel`, `shared/lib/person-name.ts`).
 * `dob`/`email`/`address` backend trả `null` khi chưa khai. `createdAt` là chuỗi `Date.toString()`
 * (không phải ISO) — `formatDateTime` vẫn parse đúng.
 */
export type User = {
  slug: string
  createdAt: string
  updatedAt: string
  phonenumber: string
  firstName?: string
  lastName?: string
  dob?: string | null
  email?: string | null
  address?: string | null
  isActive: boolean
  roleSlug: string
  roleName: string
  // PR #78; `warehouses` chỉ gồm kho là THÀNH VIÊN, không gồm kho làm quản lý.
  role?: UserRole
  warehouses?: UserWarehouse[]
}

/**
 * `RoleResponseDto`. `GET /roles` trả MẢNG THƯỜNG, không phân trang. `level` backend luôn trả (số lớn = cấp
 * cao); khai optional chỉ để fixture test cũ không phải sửa — `resolveRoleLevel` lùi về bảng có sẵn khi thiếu.
 */
export type Role = {
  slug: string
  createdAt?: string
  updatedAt?: string
  name: string
  level?: number
  description?: string
  authorityCodes: string[]
}

/** Body `POST /users`. Trường tuỳ chọn để trống thì BỎ hẳn (`@IsEmail`/`@Matches` không nhận `''`). */
export type UserInput = {
  phonenumber: string
  firstName: string
  lastName: string
  password: string
  roleSlug: string
  dob?: string
  email?: string
  address?: string
}

/**
 * Body `PATCH /users/{slug}` — sửa từng phần, field không gửi giữ nguyên. Vai trò đổi qua
 * `POST /users/{slug}/change-role`, mật khẩu qua `.../change-password`, khoá / mở khoá qua `PUT /users/{slug}/lock|unlock` (`DELETE` là XOÁ — không dùng).
 * Backend lọc cả `null` (`pickDefined`) nên CHƯA xoá trắng được trường tuỳ chọn — không có `null` ở đây.
 */
export type UserUpdateInput = {
  phonenumber?: string
  firstName?: string
  lastName?: string
  dob?: string
  email?: string
  address?: string
}

/** Body `POST /users/{slug}/change-role`. */
export type ChangeUserRoleInput = { roleSlug: string }

/** Body `POST /users/{slug}/change-password` — admin đặt mật khẩu hộ, không cần mật khẩu cũ. */
export type ResetUserPasswordInput = { newPassword: string }

/** Bộ lọc `GET /users`: `name` / `phonenumber` là chứa chuỗi; `warehouseSlug` chỉ tính thành viên kho. */
export type UserFilters = {
  roleSlug?: string
  name?: string
  phonenumber?: string
  isActive?: boolean
  warehouseSlug?: string
  /** Ngày tạo tài khoản từ / đến, `YYYY-MM-DD`, tính cả hai đầu. `startDate` > `endDate` → 400 (100422). */
  startDate?: string
  endDate?: string
}

/** Người có thể làm quản lý kho: đang hoạt động và mang vai trò MANAGER. */
export type ManagerCandidate = Pick<User, 'slug' | 'phonenumber' | 'firstName' | 'lastName'>
