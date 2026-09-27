/**
 * Hồ sơ của chính người đang đăng nhập (`GET /auth/me`).
 *
 * Hai điểm lệch so với `CurrentUser` (thứ FE tự đọc từ token) — đừng dùng lẫn hai kiểu:
 * - `userName` là cột `phonenumber` của backend (`auth.service.ts` map như vậy), nhưng cột đó chứa
 *   **định danh đăng nhập bất kỳ** — tài khoản seed mặc định có `phonenumber = 'root'`
 *   (`root-user.seeder.ts`). Đừng gắn nhãn "số điện thoại" cho nó.
 * - **Không có `version`.** Mọi endpoint ghi khác trong hệ thống đều đòi `version`, nên đề xuất có
 *   xin `GET /auth/me` trả thêm — tới lúc đó `version` vẫn optional và form chỉ gửi khi có.
 *
 * `fullName` / `email` **chưa có ở backend** — xem
 * `docs/proposals/2026-09-23-account-profile-and-sessions.md`.
 */
export type Profile = {
  userId: string
  userName: string
  roleName: string
  scope: string[]
  sessionId?: string
  version?: number
  fullName?: string
  email?: string
  isActive?: boolean
}

/** Body của `PATCH /auth/me`. Chỉ hồ sơ — không đụng vai trò, trạng thái hay mật khẩu. */
export type UpdateProfileInput = {
  fullName?: string
  email?: string
  /** Chỉ gửi khi `GET /auth/me` có trả — hiện chưa. */
  version?: number
}

/** Một thiết bị đang đăng nhập (`GET /auth/sessions`). */
export type AuthSession = {
  sessionId: string
  createdAt: string
  lastSeenAt?: string
  userAgent?: string
  ipAddress?: string
  /** Phiên của chính trình duyệt đang mở — không cho thu hồi bằng nút "Thu hồi". */
  current: boolean
}
