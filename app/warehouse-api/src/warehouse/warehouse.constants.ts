
export const WAREHOUSE_PHONENUMBER_REGEX = /^0\d{8,10}$/;

/**
 * Mã kho nghiệp vụ, vd `WH-HN-01`: 2-32 ký tự chữ/số/gạch ngang, không bắt đầu hoặc kết thúc bằng
 * gạch ngang. Nhận cả chữ thường vì DTO tự `toUpperCase()` trước khi lưu.
 */
export const WAREHOUSE_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/;
