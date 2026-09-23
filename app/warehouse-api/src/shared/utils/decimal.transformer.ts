import { ValueTransformer } from 'typeorm';

/**
 * MySQL driver trả `DECIMAL` về dưới dạng **string** (giữ nguyên độ chính xác, không nhờ IEEE-754).
 * Không transform thì `quantity` ra ngoài là `"0.020000"`, mọi phép cộng thành nối chuỗi và
 * `quantity > 0` so sánh chuỗi.
 *
 * Dùng cho MỌI cột DECIMAL của repo (tỉ lệ quy đổi, tồn kho, ngưỡng tồn) — đừng khai lại từng chỗ.
 */
export const decimalToNumber: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};

/** Số chữ số thập phân của mọi cột DECIMAL định lượng trong repo. */
export const QUANTITY_SCALE = 6;

/**
 * Làm tròn về đúng scale của cột DECIMAL. `toFixed` chứ không `Math.round(x * 1e6) / 1e6` — nhân
 * chia 1e6 trên số dấu phẩy động đẻ ra đuôi rác kiểu `0.30000000000000004`.
 */
export const roundToScale = (value: number): number => Number(value.toFixed(QUANTITY_SCALE));
