/**
 * Mã nhà cung cấp nghiệp vụ, vd `NCC-HN-01`: 2-32 ký tự chữ/số/gạch ngang, không bắt đầu hoặc kết
 * thúc bằng gạch ngang. Nhận cả chữ thường vì mapper tự `toUpperCase()` trước khi lưu.
 */
export const SUPPLIER_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/;

export const SUPPLIER_PHONENUMBER_REGEX = /^0\d{8,10}$/;

/**
 * Mã số thuế: 10 chữ số, kèm hậu tố chi nhánh 3 chữ số tuỳ chọn (vd `0101234567-001`). Chỉ check
 * format, KHÔNG check checksum thật của Tổng cục Thuế.
 */
export const SUPPLIER_TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;

/** Số chữ số thập phân của cột tiền (`unit_price_column`, `amount_column`) — DECIMAL(18,2). */
export const MONEY_SCALE = 2;

/**
 * Loại giao dịch với nhà cung cấp (`SupplierTransaction.type`).
 * - `PURCHASE`: mua hàng — bắt buộc vật tư + số lượng + đơn giá, `amount` do server tính.
 * - `RETURN`: trả hàng lại nhà cung cấp — cùng bộ field với `PURCHASE`.
 * - `PAYMENT`: thanh toán cho nhà cung cấp — chỉ có `amount`, không kèm vật tư.
 */
export enum SupplierTransactionType {
  Purchase = 'PURCHASE',
  Return = 'RETURN',
  Payment = 'PAYMENT',
}

/** Loại giao dịch gắn với 1 vật tư cụ thể (cần `materialSlug`/`quantity`/`unitPrice`). */
export const MATERIAL_TRANSACTION_TYPES: readonly SupplierTransactionType[] = [
  SupplierTransactionType.Purchase,
  SupplierTransactionType.Return,
];
