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
