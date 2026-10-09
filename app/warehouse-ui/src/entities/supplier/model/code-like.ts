/**
 * Chuỗi người dùng gõ vào ô tìm "trông như mã" (mã NCC `NCC-HN-01`, mã vật tư `NL04`): một từ, chỉ chữ Latin / số /
 * gạch nối, có ít nhất một chữ và ít nhất một số hoặc gạch. Backend khớp mã ĐÚNG nên chỉ gửi `code` khi khá chắc;
 * chữ thường (`abc`) vẫn đi tìm theo tên.
 */
export function isCodeLike(value: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(value) && /[A-Za-z]/.test(value) && /[\d-]/.test(value)
}
