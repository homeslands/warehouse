/**
 * Số có không quá `n` chữ số thập phân — khớp `IsDecimalWithScale(n)` của backend. Dựa trên `toFixed` nên số dạng
 * mũ (`1e-7`) cũng bị bắt, khác với cách tách chuỗi theo dấu chấm.
 */
export const hasAtMostDecimals = (value: number, n: number): boolean =>
  Number(value.toFixed(n)) === value

/**
 * Trần (không gồm) của cột `DECIMAL(18,6)` — 12 chữ số phần nguyên. DTO backend không chặn giá trị lớn hơn nên vượt
 * trần là lỗi 500 của MySQL strict; FE chặn trước tại ô (ngưỡng tồn, tỉ lệ quy đổi).
 */
export const DECIMAL_18_6_LIMIT = 1e12

/** Trần (không gồm) của cột tiền `DECIMAL(18,2)` — 16 chữ số phần nguyên. */
export const DECIMAL_18_2_LIMIT = 1e16

/**
 * Làm tròn tiền 2 số lẻ, ĐÚNG như `roundMoney` của backend (`Number(value.toFixed(2))`) để preview khớp giá trị
 * server lưu. Không phải làm tròn "toán học" chuẩn: `toFixed` dựa trên số nhị phân nên `1.005` → `1`.
 */
export const roundMoney = (value: number): number => Number(value.toFixed(2))
