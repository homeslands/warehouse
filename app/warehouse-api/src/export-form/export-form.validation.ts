import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

// Export form Error Code 1014xx
export const EXPORT_FORM_NOT_FOUND = 'EXPORT_FORM_NOT_FOUND';
export const EXPORT_FORM_CODE_IS_REQUIRED = 'EXPORT_FORM_CODE_IS_REQUIRED';
export const EXPORT_FORM_CODE_INVALID = 'EXPORT_FORM_CODE_INVALID';
export const EXPORT_FORM_CODE_DOES_EXIST = 'EXPORT_FORM_CODE_DOES_EXIST';
export const EXPORT_FORM_CODE_RESERVED_BY_DELETED_EXPORT_FORM =
  'EXPORT_FORM_CODE_RESERVED_BY_DELETED_EXPORT_FORM';
export const EXPORT_FORM_TYPE_INVALID = 'EXPORT_FORM_TYPE_INVALID';
export const EXPORT_FORM_PURCHASE_ORDER_IS_REQUIRED = 'EXPORT_FORM_PURCHASE_ORDER_IS_REQUIRED';
export const EXPORT_FORM_PURCHASE_ORDER_INVALID = 'EXPORT_FORM_PURCHASE_ORDER_INVALID';
export const EXPORT_FORM_INVOICE_CODE_INVALID = 'EXPORT_FORM_INVOICE_CODE_INVALID';
export const EXPORT_FORM_RECEIVER_IS_REQUIRED = 'EXPORT_FORM_RECEIVER_IS_REQUIRED';
export const EXPORT_FORM_RECEIVER_INVALID = 'EXPORT_FORM_RECEIVER_INVALID';
export const EXPORT_FORM_TOTAL_INVALID = 'EXPORT_FORM_TOTAL_INVALID';
export const EXPORT_FORM_FILE_INVALID = 'EXPORT_FORM_FILE_INVALID';
export const EXPORT_FORM_STATUS_INVALID = 'EXPORT_FORM_STATUS_INVALID';
export const EXPORT_FORM_NOT_DRAFT = 'EXPORT_FORM_NOT_DRAFT';
export const EXPORT_FORM_NOT_OWNER = 'EXPORT_FORM_NOT_OWNER';
export const EXPORT_FORM_WAREHOUSE_INACTIVE = 'EXPORT_FORM_WAREHOUSE_INACTIVE';
export const EXPORT_FORM_ITEMS_IS_REQUIRED = 'EXPORT_FORM_ITEMS_IS_REQUIRED';
export const EXPORT_FORM_ITEMS_TOO_MANY = 'EXPORT_FORM_ITEMS_TOO_MANY';
export const EXPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED =
  'EXPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED';
export const EXPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED = 'EXPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED';
export const EXPORT_FORM_ITEM_QUANTITY_INVALID = 'EXPORT_FORM_ITEM_QUANTITY_INVALID';
export const EXPORT_FORM_ITEM_UNIT_PRICE_INVALID = 'EXPORT_FORM_ITEM_UNIT_PRICE_INVALID';
export const EXPORT_FORM_ITEM_NOTE_INVALID = 'EXPORT_FORM_ITEM_NOTE_INVALID';
export const EXPORT_FORM_ITEM_DUPLICATED = 'EXPORT_FORM_ITEM_DUPLICATED';
export const EXPORT_FORM_ITEM_MATERIAL_NOT_FOUND = 'EXPORT_FORM_ITEM_MATERIAL_NOT_FOUND';
export const EXPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL = 'EXPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL';
export const EXPORT_FORM_ITEM_CONVERSION_RATE_INVALID = 'EXPORT_FORM_ITEM_CONVERSION_RATE_INVALID';
export const EXPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE =
  'EXPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE';
export const EXPORT_FORM_ITEM_BATCH_NOT_FOUND = 'EXPORT_FORM_ITEM_BATCH_NOT_FOUND';
export const EXPORT_FORM_ITEM_BATCH_NOT_OF_MATERIAL = 'EXPORT_FORM_ITEM_BATCH_NOT_OF_MATERIAL';
export const EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK = 'EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK';
export const EXPORT_FORM_ITEM_BATCH_SLUG_INVALID = 'EXPORT_FORM_ITEM_BATCH_SLUG_INVALID';
export const EXPORT_FORM_FILE_TYPE_NOT_ALLOWED = 'EXPORT_FORM_FILE_TYPE_NOT_ALLOWED';
export const EXPORT_FORM_DATE_RANGE_INVALID = 'EXPORT_FORM_DATE_RANGE_INVALID';
export const EXPORT_FORM_CODE_SEARCH_INVALID = 'EXPORT_FORM_CODE_SEARCH_INVALID';
export const EXPORT_FORM_NOT_PENDING = 'EXPORT_FORM_NOT_PENDING';
export const EXPORT_FORM_CANNOT_BE_CANCELLED = 'EXPORT_FORM_CANNOT_BE_CANCELLED';

export type TExportFormErrorCodeKey =
  | typeof EXPORT_FORM_NOT_FOUND
  | typeof EXPORT_FORM_CODE_IS_REQUIRED
  | typeof EXPORT_FORM_CODE_INVALID
  | typeof EXPORT_FORM_CODE_DOES_EXIST
  | typeof EXPORT_FORM_CODE_RESERVED_BY_DELETED_EXPORT_FORM
  | typeof EXPORT_FORM_TYPE_INVALID
  | typeof EXPORT_FORM_PURCHASE_ORDER_IS_REQUIRED
  | typeof EXPORT_FORM_PURCHASE_ORDER_INVALID
  | typeof EXPORT_FORM_INVOICE_CODE_INVALID
  | typeof EXPORT_FORM_RECEIVER_IS_REQUIRED
  | typeof EXPORT_FORM_RECEIVER_INVALID
  | typeof EXPORT_FORM_TOTAL_INVALID
  | typeof EXPORT_FORM_FILE_INVALID
  | typeof EXPORT_FORM_STATUS_INVALID
  | typeof EXPORT_FORM_NOT_DRAFT
  | typeof EXPORT_FORM_NOT_OWNER
  | typeof EXPORT_FORM_WAREHOUSE_INACTIVE
  | typeof EXPORT_FORM_ITEMS_IS_REQUIRED
  | typeof EXPORT_FORM_ITEMS_TOO_MANY
  | typeof EXPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED
  | typeof EXPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED
  | typeof EXPORT_FORM_ITEM_QUANTITY_INVALID
  | typeof EXPORT_FORM_ITEM_UNIT_PRICE_INVALID
  | typeof EXPORT_FORM_ITEM_NOTE_INVALID
  | typeof EXPORT_FORM_ITEM_DUPLICATED
  | typeof EXPORT_FORM_ITEM_MATERIAL_NOT_FOUND
  | typeof EXPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL
  | typeof EXPORT_FORM_ITEM_CONVERSION_RATE_INVALID
  | typeof EXPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE
  | typeof EXPORT_FORM_ITEM_BATCH_NOT_FOUND
  | typeof EXPORT_FORM_ITEM_BATCH_NOT_OF_MATERIAL
  | typeof EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK
  | typeof EXPORT_FORM_ITEM_BATCH_SLUG_INVALID
  | typeof EXPORT_FORM_FILE_TYPE_NOT_ALLOWED
  | typeof EXPORT_FORM_DATE_RANGE_INVALID
  | typeof EXPORT_FORM_CODE_SEARCH_INVALID
  | typeof EXPORT_FORM_NOT_PENDING
  | typeof EXPORT_FORM_CANNOT_BE_CANCELLED;

export type TExportFormErrorCode = Record<TExportFormErrorCodeKey, TErrorCodeValue>;

export const ExportFormValidation: TExportFormErrorCode = {
  EXPORT_FORM_NOT_FOUND: createErrorCode(101401, 'Export form not found', HttpStatus.NOT_FOUND),
  EXPORT_FORM_CODE_IS_REQUIRED: createErrorCode(101402, 'Export form code is required'),
  EXPORT_FORM_CODE_INVALID: createErrorCode(
    101403,
    'Export form code must be 2-32 letters, digits or hyphens',
  ),
  EXPORT_FORM_CODE_DOES_EXIST: createErrorCode(101404, 'Export form code does exist'),
  EXPORT_FORM_CODE_RESERVED_BY_DELETED_EXPORT_FORM: createErrorCode(
    101405,
    'Export form code is still held by a deleted export form',
  ),
  EXPORT_FORM_TYPE_INVALID: createErrorCode(
    101406,
    'Type must be one of PRODUCTION, DISPOSAL, TRANSFER, SALE, OTHER',
  ),
  EXPORT_FORM_PURCHASE_ORDER_IS_REQUIRED: createErrorCode(101407, 'Purchase order is required'),
  EXPORT_FORM_PURCHASE_ORDER_INVALID: createErrorCode(
    101408,
    'Purchase order must be at most 64 characters',
  ),
  EXPORT_FORM_INVOICE_CODE_INVALID: createErrorCode(
    101409,
    'Invoice code must be at most 64 characters',
  ),
  EXPORT_FORM_RECEIVER_IS_REQUIRED: createErrorCode(101410, 'Receiver is required'),
  EXPORT_FORM_RECEIVER_INVALID: createErrorCode(101411, 'Receiver must be at most 255 characters'),
  EXPORT_FORM_TOTAL_INVALID: createErrorCode(
    101412,
    'Total or item amount exceeds the maximum supported value',
  ),
  EXPORT_FORM_FILE_INVALID: createErrorCode(
    101413,
    'File must be a string of at most 1024 characters',
  ),
  EXPORT_FORM_STATUS_INVALID: createErrorCode(
    101414,
    'Status must be one of DRAFT, CONFIRMED, CANCELLED',
  ),
  EXPORT_FORM_NOT_DRAFT: createErrorCode(
    101415,
    'Only a DRAFT export form can be changed',
    HttpStatus.CONFLICT,
  ),
  EXPORT_FORM_NOT_OWNER: createErrorCode(
    101416,
    'You can only change export forms you requested',
    HttpStatus.FORBIDDEN,
  ),
  EXPORT_FORM_WAREHOUSE_INACTIVE: createErrorCode(
    101417,
    'Cannot create an export form for an inactive warehouse',
  ),
  EXPORT_FORM_ITEMS_IS_REQUIRED: createErrorCode(101418, 'Export form must have at least 1 item'),
  EXPORT_FORM_ITEMS_TOO_MANY: createErrorCode(101419, 'Export form can have at most 200 items'),
  EXPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED: createErrorCode(
    101420,
    'Item material slug is required',
  ),
  EXPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED: createErrorCode(101421, 'Item unit slug is required'),
  EXPORT_FORM_ITEM_QUANTITY_INVALID: createErrorCode(
    101422,
    'Item quantity must be a positive number with at most 6 decimal places',
  ),
  EXPORT_FORM_ITEM_UNIT_PRICE_INVALID: createErrorCode(
    101423,
    'Item unit price must be a non-negative number with at most 2 decimal places',
  ),
  EXPORT_FORM_ITEM_NOTE_INVALID: createErrorCode(101424, 'Item note must be a string'),
  EXPORT_FORM_ITEM_DUPLICATED: createErrorCode(
    101425,
    'The same material, unit and batch appear more than once in the form',
  ),
  EXPORT_FORM_ITEM_MATERIAL_NOT_FOUND: createErrorCode(
    101426,
    'Item material not found',
    HttpStatus.NOT_FOUND,
  ),
  EXPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL: createErrorCode(
    101427,
    'Item unit is not attached to the material',
  ),
  EXPORT_FORM_ITEM_CONVERSION_RATE_INVALID: createErrorCode(
    101428,
    'Conversion rate of the item unit is invalid',
  ),
  EXPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE: createErrorCode(
    101429,
    'Item material is not assigned to this warehouse',
  ),
  EXPORT_FORM_ITEM_BATCH_NOT_FOUND: createErrorCode(
    101430,
    'Item batch not found in this warehouse',
    HttpStatus.NOT_FOUND,
  ),
  EXPORT_FORM_ITEM_BATCH_NOT_OF_MATERIAL: createErrorCode(
    101431,
    'Item batch does not belong to the item material',
  ),
  EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK: createErrorCode(101432, 'Item batch is out of stock'),
  EXPORT_FORM_ITEM_BATCH_SLUG_INVALID: createErrorCode(101433, 'Item batch slug must be a string'),
  EXPORT_FORM_FILE_TYPE_NOT_ALLOWED: createErrorCode(
    101434,
    'File type is not allowed (pdf, jpg, png, webp, xls, xlsx, doc, docx only)',
  ),
  EXPORT_FORM_DATE_RANGE_INVALID: createErrorCode(
    101435,
    'startDate must not be after endDate',
    HttpStatus.BAD_REQUEST,
  ),
  EXPORT_FORM_CODE_SEARCH_INVALID: createErrorCode(
    101436,
    'code may only contain letters, digits, "_" and "-"',
    HttpStatus.BAD_REQUEST,
  ),
  EXPORT_FORM_NOT_PENDING: createErrorCode(
    101437,
    'Only a PENDING export form can be confirmed (submit the draft first)',
    HttpStatus.CONFLICT,
  ),
  EXPORT_FORM_CANNOT_BE_CANCELLED: createErrorCode(
    101438,
    'Only a DRAFT or PENDING export form can be cancelled',
    HttpStatus.CONFLICT,
  ),
};
