import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const WAREHOUSE_NOT_FOUND = 'WAREHOUSE_NOT_FOUND';
export const WAREHOUSE_NAME_IS_REQUIRED = 'WAREHOUSE_NAME_IS_REQUIRED';
export const WAREHOUSE_NAME_DOES_EXIST = 'WAREHOUSE_NAME_DOES_EXIST';
export const WAREHOUSE_CODE_IS_REQUIRED = 'WAREHOUSE_CODE_IS_REQUIRED';
export const WAREHOUSE_CODE_INVALID = 'WAREHOUSE_CODE_INVALID';
export const WAREHOUSE_CODE_DOES_EXIST = 'WAREHOUSE_CODE_DOES_EXIST';
export const WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE =
  'WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE';
export const WAREHOUSE_ADDRESS_IS_REQUIRED = 'WAREHOUSE_ADDRESS_IS_REQUIRED';
export const WAREHOUSE_PHONENUMBER_INVALID = 'WAREHOUSE_PHONENUMBER_INVALID';
export const WAREHOUSE_IS_ACTIVE_INVALID = 'WAREHOUSE_IS_ACTIVE_INVALID';
export const WAREHOUSE_HAS_MANAGER_INVALID = 'WAREHOUSE_HAS_MANAGER_INVALID';
export const WAREHOUSE_MANAGER_SLUG_IS_REQUIRED = 'WAREHOUSE_MANAGER_SLUG_IS_REQUIRED';
export const WAREHOUSE_MANAGER_NOT_FOUND = 'WAREHOUSE_MANAGER_NOT_FOUND';
export const WAREHOUSE_MANAGER_INACTIVE = 'WAREHOUSE_MANAGER_INACTIVE';
export const WAREHOUSE_MANAGER_ROLE_INVALID = 'WAREHOUSE_MANAGER_ROLE_INVALID';
export const WAREHOUSE_ACTIVE_CANNOT_BE_DELETED = 'WAREHOUSE_ACTIVE_CANNOT_BE_DELETED';

export type TWarehouseErrorCodeKey =
  | typeof WAREHOUSE_NOT_FOUND
  | typeof WAREHOUSE_NAME_IS_REQUIRED
  | typeof WAREHOUSE_NAME_DOES_EXIST
  | typeof WAREHOUSE_CODE_IS_REQUIRED
  | typeof WAREHOUSE_CODE_INVALID
  | typeof WAREHOUSE_CODE_DOES_EXIST
  | typeof WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE
  | typeof WAREHOUSE_ADDRESS_IS_REQUIRED
  | typeof WAREHOUSE_PHONENUMBER_INVALID
  | typeof WAREHOUSE_IS_ACTIVE_INVALID
  | typeof WAREHOUSE_HAS_MANAGER_INVALID
  | typeof WAREHOUSE_MANAGER_SLUG_IS_REQUIRED
  | typeof WAREHOUSE_MANAGER_NOT_FOUND
  | typeof WAREHOUSE_MANAGER_INACTIVE
  | typeof WAREHOUSE_MANAGER_ROLE_INVALID
  | typeof WAREHOUSE_ACTIVE_CANNOT_BE_DELETED;

export type TWarehouseErrorCode = Record<TWarehouseErrorCodeKey, TErrorCodeValue>;

// Warehouse Error Code 1005xx

export const WarehouseValidation: TWarehouseErrorCode = {
  WAREHOUSE_NOT_FOUND: createErrorCode(100501, 'Warehouse not found', HttpStatus.NOT_FOUND),
  WAREHOUSE_NAME_IS_REQUIRED: createErrorCode(
    100502,
    'Warehouse name is required',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_NAME_DOES_EXIST: createErrorCode(100503, 'Warehouse name does exist'),
  WAREHOUSE_CODE_IS_REQUIRED: createErrorCode(
    100504,
    'Warehouse code is required',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_CODE_INVALID: createErrorCode(
    100505,
    'Warehouse code must be 2-32 characters of letters, digits or hyphen (e.g. WH-HN-01)',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_CODE_DOES_EXIST: createErrorCode(100506, 'Warehouse code does exist'),
  WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE: createErrorCode(
    100507,
    'Warehouse code is still held by a deleted warehouse',
  ),
  WAREHOUSE_ADDRESS_IS_REQUIRED: createErrorCode(
    100508,
    'Warehouse address is required',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_PHONENUMBER_INVALID: createErrorCode(
    100509,
    'Warehouse phone number is invalid',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_IS_ACTIVE_INVALID: createErrorCode(
    100510,
    'isActive must be a boolean',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_HAS_MANAGER_INVALID: createErrorCode(
    100511,
    'hasManager must be a boolean',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_MANAGER_SLUG_IS_REQUIRED: createErrorCode(
    100513,
    'managerSlug is required - send null to unassign the manager',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_MANAGER_NOT_FOUND: createErrorCode(
    100514,
    'Manager user not found',
    HttpStatus.NOT_FOUND,
  ),
  WAREHOUSE_MANAGER_INACTIVE: createErrorCode(100515, 'Manager user is inactive'),
  WAREHOUSE_MANAGER_ROLE_INVALID: createErrorCode(
    100516,
    'Assigned manager must be a user with the MANAGER role',
  ),
  WAREHOUSE_ACTIVE_CANNOT_BE_DELETED: createErrorCode(
    100517,
    'Deactivate the warehouse before deleting it',
  ),
};
