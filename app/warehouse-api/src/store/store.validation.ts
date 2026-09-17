import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const STORE_NOT_FOUND = 'STORE_NOT_FOUND';
export const STORE_NAME_IS_REQUIRED = 'STORE_NAME_IS_REQUIRED';
export const STORE_NAME_DOES_EXIST = 'STORE_NAME_DOES_EXIST';
export const STORE_CODE_IS_REQUIRED = 'STORE_CODE_IS_REQUIRED';
export const STORE_CODE_INVALID = 'STORE_CODE_INVALID';
export const STORE_CODE_DOES_EXIST = 'STORE_CODE_DOES_EXIST';
export const STORE_CODE_RESERVED_BY_DELETED_STORE = 'STORE_CODE_RESERVED_BY_DELETED_STORE';
export const STORE_LEGAL_NAME_IS_REQUIRED = 'STORE_LEGAL_NAME_IS_REQUIRED';
export const STORE_TAX_CODE_IS_REQUIRED = 'STORE_TAX_CODE_IS_REQUIRED';
export const STORE_TAX_CODE_INVALID = 'STORE_TAX_CODE_INVALID';
export const STORE_TAX_CODE_DOES_EXIST = 'STORE_TAX_CODE_DOES_EXIST';
export const STORE_PHONENUMBER_INVALID = 'STORE_PHONENUMBER_INVALID';
export const STORE_EMAIL_INVALID = 'STORE_EMAIL_INVALID';
export const STORE_IS_ACTIVE_INVALID = 'STORE_IS_ACTIVE_INVALID';
export const STORE_VERSION_IS_REQUIRED = 'STORE_VERSION_IS_REQUIRED';
export const STORE_ACTIVE_CANNOT_BE_DELETED = 'STORE_ACTIVE_CANNOT_BE_DELETED';
export const STORE_WAREHOUSE_SLUG_IS_REQUIRED = 'STORE_WAREHOUSE_SLUG_IS_REQUIRED';
export const STORE_WAREHOUSE_INACTIVE = 'STORE_WAREHOUSE_INACTIVE';
export const STORE_WAREHOUSE_ALREADY_ASSIGNED = 'STORE_WAREHOUSE_ALREADY_ASSIGNED';
export const STORE_WAREHOUSE_RESERVED_BY_DELETED_STORE =
  'STORE_WAREHOUSE_RESERVED_BY_DELETED_STORE';

export type TStoreErrorCodeKey =
  | typeof STORE_NOT_FOUND
  | typeof STORE_NAME_IS_REQUIRED
  | typeof STORE_NAME_DOES_EXIST
  | typeof STORE_CODE_IS_REQUIRED
  | typeof STORE_CODE_INVALID
  | typeof STORE_CODE_DOES_EXIST
  | typeof STORE_CODE_RESERVED_BY_DELETED_STORE
  | typeof STORE_LEGAL_NAME_IS_REQUIRED
  | typeof STORE_TAX_CODE_IS_REQUIRED
  | typeof STORE_TAX_CODE_INVALID
  | typeof STORE_TAX_CODE_DOES_EXIST
  | typeof STORE_PHONENUMBER_INVALID
  | typeof STORE_EMAIL_INVALID
  | typeof STORE_IS_ACTIVE_INVALID
  | typeof STORE_VERSION_IS_REQUIRED
  | typeof STORE_ACTIVE_CANNOT_BE_DELETED
  | typeof STORE_WAREHOUSE_SLUG_IS_REQUIRED
  | typeof STORE_WAREHOUSE_INACTIVE
  | typeof STORE_WAREHOUSE_ALREADY_ASSIGNED
  | typeof STORE_WAREHOUSE_RESERVED_BY_DELETED_STORE;

export type TStoreErrorCode = Record<TStoreErrorCodeKey, TErrorCodeValue>;

// Store Error Code 1010xx

export const StoreValidation: TStoreErrorCode = {
  STORE_NOT_FOUND: createErrorCode(101001, 'Store not found', HttpStatus.NOT_FOUND),
  STORE_NAME_IS_REQUIRED: createErrorCode(101002, 'Store name is required', HttpStatus.BAD_REQUEST),
  STORE_NAME_DOES_EXIST: createErrorCode(101003, 'Store name does exist'),
  STORE_CODE_IS_REQUIRED: createErrorCode(101004, 'Store code is required', HttpStatus.BAD_REQUEST),
  STORE_CODE_INVALID: createErrorCode(
    101005,
    'Store code must be 2-32 characters of letters, digits or hyphen (e.g. ST-HN-01)',
    HttpStatus.BAD_REQUEST,
  ),
  STORE_CODE_DOES_EXIST: createErrorCode(101006, 'Store code does exist'),
  STORE_CODE_RESERVED_BY_DELETED_STORE: createErrorCode(
    101007,
    'Store code is still held by a deleted store',
  ),
  STORE_LEGAL_NAME_IS_REQUIRED: createErrorCode(
    101008,
    'Store legal name is required',
    HttpStatus.BAD_REQUEST,
  ),
  STORE_TAX_CODE_IS_REQUIRED: createErrorCode(
    101009,
    'Store tax code is required',
    HttpStatus.BAD_REQUEST,
  ),
  STORE_TAX_CODE_INVALID: createErrorCode(
    101010,
    'Store tax code must be 10 digits with an optional 3-digit branch suffix (e.g. 0101234567-001)',
    HttpStatus.BAD_REQUEST,
  ),
  STORE_TAX_CODE_DOES_EXIST: createErrorCode(101011, 'Store tax code does exist'),
  STORE_PHONENUMBER_INVALID: createErrorCode(
    101012,
    'Store phone number is invalid',
    HttpStatus.BAD_REQUEST,
  ),
  STORE_EMAIL_INVALID: createErrorCode(101013, 'Store email is invalid', HttpStatus.BAD_REQUEST),
  STORE_IS_ACTIVE_INVALID: createErrorCode(
    101014,
    'isActive must be a boolean',
    HttpStatus.BAD_REQUEST,
  ),
  STORE_VERSION_IS_REQUIRED: createErrorCode(
    101015,
    'Version is required and must be an integer',
    HttpStatus.BAD_REQUEST,
  ),
  STORE_ACTIVE_CANNOT_BE_DELETED: createErrorCode(
    101016,
    'Deactivate the store before deleting it',
  ),
  STORE_WAREHOUSE_SLUG_IS_REQUIRED: createErrorCode(
    101017,
    'Warehouse slug is required (send null to unassign)',
    HttpStatus.BAD_REQUEST,
  ),
  STORE_WAREHOUSE_INACTIVE: createErrorCode(
    101018,
    'The warehouse is inactive and cannot be assigned to a store',
  ),
  STORE_WAREHOUSE_ALREADY_ASSIGNED: createErrorCode(
    101019,
    'The warehouse is already assigned to another store',
  ),
  STORE_WAREHOUSE_RESERVED_BY_DELETED_STORE: createErrorCode(
    101020,
    'The warehouse is still held by a deleted store',
  ),
};
