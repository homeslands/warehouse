/**
 * Độ dài mật khẩu tối thiểu (NIST 800-63B: tối thiểu 8, không ép ký tự đặc biệt). Áp ở form tạo người dùng,
 * đặt lại mật khẩu hộ và tự đổi mật khẩu.
 *
 * LỚP CHẶN TẠM ở giao diện: backend hiện chỉ đòi không rỗng (gọi thẳng API vẫn đặt được mật khẩu 1 ký tự) —
 * đã đề xuất trong `docs/proposals/2026-09-30-user-management-api.md` (D8). Backend làm xong thì giữ luật này
 * cho khớp và map mã lỗi của backend vào ô mật khẩu.
 */
export const MIN_PASSWORD_LENGTH = 8

/** Ô trống để luật "bắt buộc" báo; chỉ xét độ dài khi đã nhập gì đó. */
export const meetsMinPasswordLength = (value: string): boolean =>
  value === '' || value.length >= MIN_PASSWORD_LENGTH
