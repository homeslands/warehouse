/**
 * Họ tên đầy đủ theo thứ tự tiếng Việt (họ trước tên): `{ lastName: 'Nguyễn', firstName: 'Văn A' }` →
 * `"Nguyễn Văn A"`. Backend để chuỗi rỗng cho tài khoản chưa khai tên → trả `''`, bên gọi tự lùi về
 * định danh khác (số điện thoại / tên đăng nhập).
 */
export function formatFullName(person: {
  firstName?: string | null
  lastName?: string | null
}): string {
  return [person.lastName, person.firstName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

/** Chữ viết tắt cho ảnh đại diện: chữ đầu của từ đầu + từ cuối (`"Nguyễn Văn A"` → `"NA"`). */
export function initialsOf(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Nhãn một người trong ô chọn / bảng: `"Nguyễn Văn A (0901234567)"`. Chưa có tên → chỉ số điện thoại.
 * Dùng chung cho người dùng (`GET /users`) và quản lý kho/cửa hàng (`manager` trong response).
 */
export function formatPersonLabel(person: {
  phonenumber: string
  firstName?: string | null
  lastName?: string | null
}): string {
  const name = formatFullName(person)
  return name ? `${name} (${person.phonenumber})` : person.phonenumber
}
