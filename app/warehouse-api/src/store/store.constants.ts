/**
 * Mã cửa hàng nghiệp vụ, vd `ST-HN-01`: 2-32 ký tự chữ/số/gạch ngang, không bắt đầu hoặc kết thúc
 * bằng gạch ngang. Nhận cả chữ thường vì mapper tự `toUpperCase()` trước khi lưu.
 */
export const STORE_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/;

export const STORE_PHONENUMBER_REGEX = /^0\d{8,10}$/;

/**
 * Mã số thuế: 10 chữ số, kèm hậu tố chi nhánh 3 chữ số tuỳ chọn (vd `0101234567-001`). Chỉ check
 * format, KHÔNG check checksum thật của Tổng cục Thuế.
 */
export const STORE_TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;
