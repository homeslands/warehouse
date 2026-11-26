import { FILE_UPLOAD_ALLOWED_TYPES } from 'src/file/file.constant';

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

/**
 * Số dòng tối đa trong 1 phiếu. 1 dòng = 1 đơn vị hàng có mã riêng (`ImportFormItem.code`), nên trần
 * này là số đơn vị hàng của phiếu, không phải số loại vật tư.
 */
export const IMPORT_FORM_ITEMS_MAX = 1000;

/** Số đơn vị tối đa của 1 lần `POST .../items` (nhập tay `quantity` = N ⇒ N dòng, N mã). */
export const IMPORT_FORM_ADD_QUANTITY_MAX = 500;

/** Độ dài cột mã đơn vị hàng (`import_form_item_tbl.code_column`, `material_batch_tbl.code_column`). */
export const ITEM_CODE_MAX_LENGTH = 64;

export const IMPORT_FORM_REFERENCE_MAX_LENGTH = 64;
export const IMPORT_FORM_FILE_MAX_LENGTH = 1024;

/** Upload file đính kèm phiếu (`POST .../import-forms/upload-file`) — key S3 nằm dưới thư mục này. */
export const IMPORT_FORM_UPLOAD_FOLDER = 'import-forms';
export const IMPORT_FORM_UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10MB
/**
 * Mimetype nhận cho file đính kèm phiếu — suy ra từ `FILE_UPLOAD_ALLOWED_TYPES` (một nguồn duy nhất).
 * Check thật ở service dùng `isAllowedUploadType` (đuôi VÀ mimetype phải cùng khớp một cặp).
 */
export const IMPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES: readonly string[] = [
  ...new Set([...FILE_UPLOAD_ALLOWED_TYPES.values()].flat()),
];
