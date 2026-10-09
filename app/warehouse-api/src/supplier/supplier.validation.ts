import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

// Supplier Error Code 1012xx
export const SUPPLIER_NOT_FOUND = 'SUPPLIER_NOT_FOUND';
export const SUPPLIER_NAME_IS_REQUIRED = 'SUPPLIER_NAME_IS_REQUIRED';
export const SUPPLIER_CODE_IS_REQUIRED = 'SUPPLIER_CODE_IS_REQUIRED';
export const SUPPLIER_CODE_INVALID = 'SUPPLIER_CODE_INVALID';
export const SUPPLIER_CODE_DOES_EXIST = 'SUPPLIER_CODE_DOES_EXIST';
export const SUPPLIER_CODE_RESERVED_BY_DELETED_SUPPLIER =
  'SUPPLIER_CODE_RESERVED_BY_DELETED_SUPPLIER';
export const SUPPLIER_TAX_CODE_INVALID = 'SUPPLIER_TAX_CODE_INVALID';
export const SUPPLIER_TAX_CODE_DOES_EXIST = 'SUPPLIER_TAX_CODE_DOES_EXIST';
export const SUPPLIER_PHONENUMBER_INVALID = 'SUPPLIER_PHONENUMBER_INVALID';
export const SUPPLIER_EMAIL_INVALID = 'SUPPLIER_EMAIL_INVALID';
export const SUPPLIER_HAS_MATERIALS = 'SUPPLIER_HAS_MATERIALS';
export const SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER =
  'SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER';
export const SUPPLIER_MATERIAL_NOT_ATTACHED = 'SUPPLIER_MATERIAL_NOT_ATTACHED';
export const SUPPLIER_TRANSACTION_TYPE_INVALID = 'SUPPLIER_TRANSACTION_TYPE_INVALID';
export const SUPPLIER_TRANSACTION_MATERIAL_IS_REQUIRED =
  'SUPPLIER_TRANSACTION_MATERIAL_IS_REQUIRED';
export const SUPPLIER_TRANSACTION_QUANTITY_INVALID = 'SUPPLIER_TRANSACTION_QUANTITY_INVALID';
export const SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID = 'SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID';
export const SUPPLIER_TRANSACTION_AMOUNT_INVALID = 'SUPPLIER_TRANSACTION_AMOUNT_INVALID';
export const SUPPLIER_TRANSACTION_DATE_INVALID = 'SUPPLIER_TRANSACTION_DATE_INVALID';
export const SUPPLIER_TRANSACTION_PAYMENT_HAS_MATERIAL =
  'SUPPLIER_TRANSACTION_PAYMENT_HAS_MATERIAL';
export const SUPPLIER_MATERIAL_DATE_INVALID = 'SUPPLIER_MATERIAL_DATE_INVALID';
export const SUPPLIER_MATERIAL_SLUGS_INVALID = 'SUPPLIER_MATERIAL_SLUGS_INVALID';

export type TSupplierErrorCodeKey =
  | typeof SUPPLIER_NOT_FOUND
  | typeof SUPPLIER_NAME_IS_REQUIRED
  | typeof SUPPLIER_CODE_IS_REQUIRED
  | typeof SUPPLIER_CODE_INVALID
  | typeof SUPPLIER_CODE_DOES_EXIST
  | typeof SUPPLIER_CODE_RESERVED_BY_DELETED_SUPPLIER
  | typeof SUPPLIER_TAX_CODE_INVALID
  | typeof SUPPLIER_TAX_CODE_DOES_EXIST
  | typeof SUPPLIER_PHONENUMBER_INVALID
  | typeof SUPPLIER_EMAIL_INVALID
  | typeof SUPPLIER_HAS_MATERIALS
  | typeof SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER
  | typeof SUPPLIER_MATERIAL_NOT_ATTACHED
  | typeof SUPPLIER_TRANSACTION_TYPE_INVALID
  | typeof SUPPLIER_TRANSACTION_MATERIAL_IS_REQUIRED
  | typeof SUPPLIER_TRANSACTION_QUANTITY_INVALID
  | typeof SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID
  | typeof SUPPLIER_TRANSACTION_AMOUNT_INVALID
  | typeof SUPPLIER_TRANSACTION_DATE_INVALID
  | typeof SUPPLIER_TRANSACTION_PAYMENT_HAS_MATERIAL
  | typeof SUPPLIER_MATERIAL_DATE_INVALID
  | typeof SUPPLIER_MATERIAL_SLUGS_INVALID;

export type TSupplierErrorCode = Record<TSupplierErrorCodeKey, TErrorCodeValue>;

export const SupplierValidation: TSupplierErrorCode = {
  SUPPLIER_NOT_FOUND: createErrorCode(101201, 'Supplier not found', HttpStatus.NOT_FOUND),
  SUPPLIER_NAME_IS_REQUIRED: createErrorCode(101202, 'Supplier name is required'),
  SUPPLIER_CODE_IS_REQUIRED: createErrorCode(101203, 'Supplier code is required'),
  SUPPLIER_CODE_INVALID: createErrorCode(
    101204,
    'Supplier code must be 2-32 letters, digits or hyphens, not starting/ending with a hyphen',
  ),
  SUPPLIER_CODE_DOES_EXIST: createErrorCode(101205, 'Supplier code does exist'),
  SUPPLIER_CODE_RESERVED_BY_DELETED_SUPPLIER: createErrorCode(
    101206,
    'Supplier code is still held by a deleted supplier',
  ),
  SUPPLIER_TAX_CODE_INVALID: createErrorCode(101207, 'Supplier tax code is invalid'),
  SUPPLIER_TAX_CODE_DOES_EXIST: createErrorCode(101208, 'Supplier tax code does exist'),
  SUPPLIER_PHONENUMBER_INVALID: createErrorCode(101209, 'Supplier phone number is invalid'),
  SUPPLIER_EMAIL_INVALID: createErrorCode(101210, 'Supplier email is invalid'),
  SUPPLIER_HAS_MATERIALS: createErrorCode(
    101211,
    'Supplier still has materials attached, detach them before deleting',
  ),
  SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER: createErrorCode(
    101212,
    'Material is already attached to another supplier',
  ),
  SUPPLIER_MATERIAL_NOT_ATTACHED: createErrorCode(
    101213,
    'Material is not attached to this supplier',
  ),
  SUPPLIER_TRANSACTION_TYPE_INVALID: createErrorCode(
    101214,
    'Supplier transaction type is invalid',
  ),
  SUPPLIER_TRANSACTION_MATERIAL_IS_REQUIRED: createErrorCode(
    101215,
    'Material, quantity and unit price are required for PURCHASE/RETURN transactions',
  ),
  SUPPLIER_TRANSACTION_QUANTITY_INVALID: createErrorCode(
    101216,
    'Quantity must be a positive number with at most 6 decimal places',
  ),
  SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID: createErrorCode(
    101217,
    'Unit price must be a non-negative number with at most 2 decimal places',
  ),
  SUPPLIER_TRANSACTION_AMOUNT_INVALID: createErrorCode(
    101218,
    'Amount must be a positive number with at most 2 decimal places',
  ),
  SUPPLIER_TRANSACTION_DATE_INVALID: createErrorCode(
    101219,
    'Transaction date must be an ISO 8601 date',
  ),
  SUPPLIER_TRANSACTION_PAYMENT_HAS_MATERIAL: createErrorCode(
    101220,
    'PAYMENT transactions must not carry material, quantity or unit price',
  ),
  SUPPLIER_MATERIAL_DATE_INVALID: createErrorCode(
    101221,
    'Material date filter (from/to) must be an ISO 8601 date',
  ),
  SUPPLIER_MATERIAL_SLUGS_INVALID: createErrorCode(
    101222,
    'materialSlugs must be a non-empty array of at most 100 material slugs',
  ),
};
