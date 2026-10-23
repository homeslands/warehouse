import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

// Import form Error Code 1013xx
export const IMPORT_FORM_NOT_FOUND = 'IMPORT_FORM_NOT_FOUND';
export const IMPORT_FORM_CODE_IS_REQUIRED = 'IMPORT_FORM_CODE_IS_REQUIRED';
export const IMPORT_FORM_CODE_INVALID = 'IMPORT_FORM_CODE_INVALID';
export const IMPORT_FORM_CODE_DOES_EXIST = 'IMPORT_FORM_CODE_DOES_EXIST';
export const IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM =
  'IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM';
export const IMPORT_FORM_PURCHASE_ORDER_INVALID = 'IMPORT_FORM_PURCHASE_ORDER_INVALID';
export const IMPORT_FORM_INVOICE_CODE_IS_REQUIRED = 'IMPORT_FORM_INVOICE_CODE_IS_REQUIRED';
export const IMPORT_FORM_INVOICE_CODE_INVALID = 'IMPORT_FORM_INVOICE_CODE_INVALID';
export const IMPORT_FORM_DATE_INVALID = 'IMPORT_FORM_DATE_INVALID';
export const IMPORT_FORM_TOTAL_INVALID = 'IMPORT_FORM_TOTAL_INVALID';
export const IMPORT_FORM_FILE_INVALID = 'IMPORT_FORM_FILE_INVALID';
export const IMPORT_FORM_STATUS_INVALID = 'IMPORT_FORM_STATUS_INVALID';
export const IMPORT_FORM_NOT_DRAFT = 'IMPORT_FORM_NOT_DRAFT';
export const IMPORT_FORM_NOT_OWNER = 'IMPORT_FORM_NOT_OWNER';
export const IMPORT_FORM_WAREHOUSE_INACTIVE = 'IMPORT_FORM_WAREHOUSE_INACTIVE';

export const IMPORT_FORM_ITEMS_IS_REQUIRED = 'IMPORT_FORM_ITEMS_IS_REQUIRED';
export const IMPORT_FORM_ITEMS_TOO_MANY = 'IMPORT_FORM_ITEMS_TOO_MANY';
export const IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED =
  'IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED';
export const IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED = 'IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED';
export const IMPORT_FORM_ITEM_QUANTITY_INVALID = 'IMPORT_FORM_ITEM_QUANTITY_INVALID';
export const IMPORT_FORM_ITEM_UNIT_PRICE_INVALID = 'IMPORT_FORM_ITEM_UNIT_PRICE_INVALID';
export const IMPORT_FORM_ITEM_NOTE_INVALID = 'IMPORT_FORM_ITEM_NOTE_INVALID';
export const IMPORT_FORM_ITEM_DUPLICATED = 'IMPORT_FORM_ITEM_DUPLICATED';
export const IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND = 'IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND';
export const IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL = 'IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL';
export const IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID = 'IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID';
export const IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE =
  'IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE';
export const IMPORT_FORM_FILE_TYPE_NOT_ALLOWED = 'IMPORT_FORM_FILE_TYPE_NOT_ALLOWED';
export const IMPORT_FORM_DATE_RANGE_INVALID = 'IMPORT_FORM_DATE_RANGE_INVALID';
export const IMPORT_FORM_CODE_SEARCH_INVALID = 'IMPORT_FORM_CODE_SEARCH_INVALID';
export const IMPORT_FORM_ITEM_SUPPLIER_NOT_OF_MATERIAL =
  'IMPORT_FORM_ITEM_SUPPLIER_NOT_OF_MATERIAL';

export const IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID = 'IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID';

export type TImportFormErrorCodeKey =
  | typeof IMPORT_FORM_NOT_FOUND
  | typeof IMPORT_FORM_CODE_IS_REQUIRED
  | typeof IMPORT_FORM_CODE_INVALID
  | typeof IMPORT_FORM_CODE_DOES_EXIST
  | typeof IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM
  | typeof IMPORT_FORM_PURCHASE_ORDER_INVALID
  | typeof IMPORT_FORM_INVOICE_CODE_IS_REQUIRED
  | typeof IMPORT_FORM_INVOICE_CODE_INVALID
  | typeof IMPORT_FORM_DATE_INVALID
  | typeof IMPORT_FORM_TOTAL_INVALID
  | typeof IMPORT_FORM_FILE_INVALID
  | typeof IMPORT_FORM_STATUS_INVALID
  | typeof IMPORT_FORM_NOT_DRAFT
  | typeof IMPORT_FORM_NOT_OWNER
  | typeof IMPORT_FORM_WAREHOUSE_INACTIVE
  | typeof IMPORT_FORM_ITEMS_IS_REQUIRED
  | typeof IMPORT_FORM_ITEMS_TOO_MANY
  | typeof IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED
  | typeof IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED
  | typeof IMPORT_FORM_ITEM_QUANTITY_INVALID
  | typeof IMPORT_FORM_ITEM_UNIT_PRICE_INVALID
  | typeof IMPORT_FORM_ITEM_NOTE_INVALID
  | typeof IMPORT_FORM_ITEM_DUPLICATED
  | typeof IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND
  | typeof IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL
  | typeof IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID
  | typeof IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE
  | typeof IMPORT_FORM_FILE_TYPE_NOT_ALLOWED
  | typeof IMPORT_FORM_ITEM_SUPPLIER_NOT_OF_MATERIAL
  | typeof IMPORT_FORM_DATE_RANGE_INVALID
  | typeof IMPORT_FORM_CODE_SEARCH_INVALID
  | typeof IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID;

export type TImportFormErrorCode = Record<TImportFormErrorCodeKey, TErrorCodeValue>;

export const ImportFormValidation: TImportFormErrorCode = {
  IMPORT_FORM_NOT_FOUND: createErrorCode(101301, 'Import form not found', HttpStatus.NOT_FOUND),
  IMPORT_FORM_CODE_IS_REQUIRED: createErrorCode(101302, 'Import form code is required'),
  IMPORT_FORM_CODE_INVALID: createErrorCode(
    101303,
    'Import form code must be 2-32 letters, digits or hyphens',
  ),
  IMPORT_FORM_CODE_DOES_EXIST: createErrorCode(101304, 'Import form code does exist'),
  IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM: createErrorCode(
    101305,
    'Import form code is still held by a deleted import form',
  ),
  IMPORT_FORM_PURCHASE_ORDER_INVALID: createErrorCode(
    101306,
    'Purchase order must be at most 64 characters',
  ),
  IMPORT_FORM_INVOICE_CODE_IS_REQUIRED: createErrorCode(101307, 'Invoice code is required'),
  IMPORT_FORM_INVOICE_CODE_INVALID: createErrorCode(
    101308,
    'Invoice code must be at most 64 characters',
  ),
  // 101309 (`IMPORT_FORM_SUPPLIER_SLUG_IS_REQUIRED`) đã bỏ — phiếu nhập không gắn nhà cung cấp.
  IMPORT_FORM_DATE_INVALID: createErrorCode(
    101310,
    'Date must be a valid date in YYYY-MM-DD format',
  ),
  // `total` không còn nhận từ client (server tính Σ amount) — mã giữ lại cho trường hợp tổng/tiền
  // của dòng vượt DECIMAL(18,2).
  IMPORT_FORM_TOTAL_INVALID: createErrorCode(
    101311,
    'Total or item amount exceeds the maximum supported value',
  ),
  IMPORT_FORM_FILE_INVALID: createErrorCode(
    101312,
    'File must be a string of at most 1024 characters',
  ),
  IMPORT_FORM_STATUS_INVALID: createErrorCode(
    101313,
    'Status must be one of DRAFT, CONFIRMED, CANCELLED',
  ),
  IMPORT_FORM_NOT_DRAFT: createErrorCode(
    101314,
    'Only a DRAFT import form can be changed',
    HttpStatus.CONFLICT,
  ),
  IMPORT_FORM_NOT_OWNER: createErrorCode(
    101315,
    'You can only change import forms you requested',
    HttpStatus.FORBIDDEN,
  ),
  IMPORT_FORM_WAREHOUSE_INACTIVE: createErrorCode(
    101316,
    'Cannot create an import form for an inactive warehouse',
  ),
  IMPORT_FORM_ITEMS_IS_REQUIRED: createErrorCode(101317, 'Import form must have at least 1 item'),
  IMPORT_FORM_ITEMS_TOO_MANY: createErrorCode(101318, 'Import form can have at most 200 items'),
  IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED: createErrorCode(
    101319,
    'Item material slug is required',
  ),
  IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED: createErrorCode(101320, 'Item unit slug is required'),
  IMPORT_FORM_ITEM_QUANTITY_INVALID: createErrorCode(
    101321,
    'Item quantity must be a positive number with at most 6 decimal places',
  ),
  IMPORT_FORM_ITEM_UNIT_PRICE_INVALID: createErrorCode(
    101322,
    'Item unit price must be a non-negative number with at most 2 decimal places',
  ),
  IMPORT_FORM_ITEM_NOTE_INVALID: createErrorCode(101323, 'Item note must be a string'),
  IMPORT_FORM_ITEM_DUPLICATED: createErrorCode(
    101324,
    'The same material and unit appear more than once in the form',
  ),
  IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND: createErrorCode(
    101325,
    'Item material not found',
    HttpStatus.NOT_FOUND,
  ),
  IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL: createErrorCode(
    101326,
    'Item unit is not attached to the material',
  ),
  IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID: createErrorCode(
    101327,
    'Conversion rate of the item unit is invalid',
  ),
  IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE: createErrorCode(
    101328,
    'Item material is not assigned to this warehouse',
  ),
  IMPORT_FORM_FILE_TYPE_NOT_ALLOWED: createErrorCode(
    101329,
    'File type is not allowed (pdf, jpg, png, webp, xls, xlsx, doc, docx only)',
  ),
  IMPORT_FORM_ITEM_SUPPLIER_NOT_OF_MATERIAL: createErrorCode(
    101330,
    'Item supplier is not attached to the material',
  ),
  IMPORT_FORM_DATE_RANGE_INVALID: createErrorCode(
    101331,
    'startDate must not be after endDate',
    HttpStatus.BAD_REQUEST,
  ),
  // `code` của `GET .../import-forms` và `GET .../import-forms/available-materials`.
  IMPORT_FORM_CODE_SEARCH_INVALID: createErrorCode(
    101332,
    'code may only contain letters, digits, "_" and "-"',
    HttpStatus.BAD_REQUEST,
  ),
  IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID: createErrorCode(
    101333,
    'Item expiry date must be a valid date in YYYY-MM-DD format, not before the form date',
  ),
};
