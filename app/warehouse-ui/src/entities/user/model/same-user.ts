/**
 * `target` có phải chính người đang đăng nhập không. `GET /auth/me` trả `userSlug` từ PR #80 — so bằng
 * slug (định danh public duy nhất). Phiên đăng nhập cũ còn lưu trong trình duyệt chưa có `userSlug` thì lùi
 * về so định danh đăng nhập (`userName` = cột `phonenumber`).
 *
 * Nhận kiểu cấu trúc thay vì `CurrentUser`: `entities/user` không được import `entities/session`.
 */
export function isSameUser(
  me: { userSlug?: string; userName: string } | null,
  target: { slug: string; phonenumber: string },
): boolean {
  if (me === null) return false
  if (me.userSlug) return target.slug === me.userSlug
  return target.phonenumber === me.userName
}
