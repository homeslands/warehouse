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
export const IMPORT_FORM_SUPPLIER_SLUG_IS_REQUIRED = 'IMPORT_FORM_SUPPLIER_SLUG_IS_REQUIRED';
export const IMPORT_FORM_DATE_INVALID = 'IMPORT_FORM_DATE_INVALID';
export const IMPORT_FORM_TOTAL_INVALID = 'IMPORT_FORM_TOTAL_INVALID';
export const IMPORT_FORM_FILE_INVALID = 'IMPORT_FORM_FILE_INVALID';
export const IMPORT_FORM_STATUS_INVALID = 'IMPORT_FORM_STATUS_INVALID';
export const IMPORT_FORM_NOT_DRAFT = 'IMPORT_FORM_NOT_DRAFT';
export const IMPORT_FORM_NOT_OWNER = 'IMPORT_FORM_NOT_OWNER';
export const IMPORT_FORM_WAREHOUSE_INACTIVE = 'IMPORT_FORM_WAREHOUSE_INACTIVE';

export type TImportFormErrorCodeKey =
  | typeof IMPORT_FORM_NOT_FOUND
  | typeof IMPORT_FORM_CODE_IS_REQUIRED
  | typeof IMPORT_FORM_CODE_INVALID
  | typeof IMPORT_FORM_CODE_DOES_EXIST
  | typeof IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM
  | typeof IMPORT_FORM_PURCHASE_ORDER_INVALID
  | typeof IMPORT_FORM_INVOICE_CODE_IS_REQUIRED
  | typeof IMPORT_FORM_INVOICE_CODE_INVALID
  | typeof IMPORT_FORM_SUPPLIER_SLUG_IS_REQUIRED
  | typeof IMPORT_FORM_DATE_INVALID
  | typeof IMPORT_FORM_TOTAL_INVALID
  | typeof IMPORT_FORM_FILE_INVALID
  | typeof IMPORT_FORM_STATUS_INVALID
  | typeof IMPORT_FORM_NOT_DRAFT
  | typeof IMPORT_FORM_NOT_OWNER
  | typeof IMPORT_FORM_WAREHOUSE_INACTIVE;

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
  IMPORT_FORM_SUPPLIER_SLUG_IS_REQUIRED: createErrorCode(101309, 'Supplier slug is required'),
  IMPORT_FORM_DATE_INVALID: createErrorCode(
    101310,
    'Date must be a valid date in YYYY-MM-DD format',
  ),
  IMPORT_FORM_TOTAL_INVALID: createErrorCode(
    101311,
    'Total must be a non-negative number with at most 2 decimal places',
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
};
