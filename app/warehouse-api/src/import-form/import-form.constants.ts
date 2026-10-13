/**
 * Vòng đời phiếu nhập kho: `DRAFT` → `CONFIRMED` | `CANCELLED`, 1 chiều, không quay lại.
 * - Chỉ `DRAFT` sửa/xoá được. `CONFIRMED`/`CANCELLED` là bất biến — chặn ở service, KHÔNG có
 *   authority nào mở được (xem `1783728000012-seed-warehouse-form-authorities.ts`).
 * - Cả xác nhận lẫn huỷ đều do người có `IMPORT_FORM_CONFIRM` quyết định, người đó được ghi vào
 *   `approver`.
 */
export enum ImportFormStatus {
  Draft = 'DRAFT',
  Confirmed = 'CONFIRMED',
  Cancelled = 'CANCELLED',
}

/** Ngày nhập dạng `YYYY-MM-DD` (cột `date`, không dính múi giờ). */
export const IMPORT_FORM_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Số chữ số thập phân của cột tiền (`total_column`, `unit_price_column`, `amount_column`) — DECIMAL(18,2). */
export const IMPORT_FORM_MONEY_SCALE = 2;

/** Số dòng vật tư tối đa trong 1 phiếu. */
export const IMPORT_FORM_ITEMS_MAX = 200;

export const IMPORT_FORM_REFERENCE_MAX_LENGTH = 64;
export const IMPORT_FORM_FILE_MAX_LENGTH = 1024;
