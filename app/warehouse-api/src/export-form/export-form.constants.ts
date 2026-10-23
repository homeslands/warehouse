import {
  IMPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES,
  IMPORT_FORM_UPLOAD_MAX_SIZE,
} from 'src/import-form/import-form.constants';

/**
 * Vòng đời phiếu xuất kho: `DRAFT` → `CONFIRMED` | `CANCELLED`, 1 chiều, giống phiếu nhập.
 * - Chỉ `DRAFT` sửa/xoá được; `CONFIRMED`/`CANCELLED` bất biến (chặn ở service, không authority nào mở).
 * - Phiếu nháp KHÔNG giữ chỗ tồn/lô: chỉ lúc xác nhận mới kiểm và trừ, dưới khoá.
 */
export enum ExportFormStatus {
  Draft = 'DRAFT',
  Confirmed = 'CONFIRMED',
  Cancelled = 'CANCELLED',
}

/**
 * Lý do xuất kho. `DISPOSAL` (xuất huỷ) cần thêm `EXPORT_FORM_APPROVE_DISPOSAL` để xác nhận
 * (seed `1783728000012`: SUPERVISOR tạo được nhưng không tự duyệt được).
 */
export enum ExportFormType {
  Production = 'PRODUCTION',
  Disposal = 'DISPOSAL',
  Transfer = 'TRANSFER',
  Sale = 'SALE',
  Other = 'OTHER',
}

/** Số chữ số thập phân của cột tiền — DECIMAL(18,2). */
export const EXPORT_FORM_MONEY_SCALE = 2;

/** Số dòng vật tư tối đa trong 1 phiếu (tính trên body; xác nhận có thể tách thêm dòng theo lô). */
export const EXPORT_FORM_ITEMS_MAX = 200;

export const EXPORT_FORM_REFERENCE_MAX_LENGTH = 64;
export const EXPORT_FORM_RECEIVER_MAX_LENGTH = 255;
export const EXPORT_FORM_FILE_MAX_LENGTH = 1024;

/** Upload file đính kèm phiếu (`POST .../export-forms/upload-file`) — cùng giới hạn với phiếu nhập. */
export const EXPORT_FORM_UPLOAD_FOLDER = 'export-forms';
export const EXPORT_FORM_UPLOAD_MAX_SIZE = IMPORT_FORM_UPLOAD_MAX_SIZE;
export const EXPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES = IMPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES;
