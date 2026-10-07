import type { UserFilters } from '@/entities/user'

/**
 * Một ô tìm kiếm, hai tham số backend: `GET /users` tìm tên (`name`) và SĐT (`phonenumber`) riêng, không có
 * tham số chung. Toàn chữ số (bỏ khoảng trắng) → `phonenumber`; còn lại → `name`. Định danh đăng nhập kiểu
 * `root` đi `name` nên không tìm được theo tên đăng nhập chữ — chấp nhận, tài khoản như vậy rất ít.
 */
export function toUserSearchQuery(
  search: string | undefined,
): Pick<UserFilters, 'name' | 'phonenumber'> {
  const value = search?.trim() ?? ''
  if (value === '') return {}
  const digits = value.replace(/\s+/g, '')
  return /^\d+$/.test(digits) ? { phonenumber: digits } : { name: value }
}
