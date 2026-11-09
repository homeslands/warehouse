/**
 * Một người trong ô chọn người (bộ lọc Người lập / Người xác nhận). Rút gọn từ `UserResponseDto`:
 * `name` = họ + tên (họ trước), chuỗi rỗng khi tài khoản chưa khai tên.
 */
export type UserOption = { slug: string; name: string; phonenumber: string }
