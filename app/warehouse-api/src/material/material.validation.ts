import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const MATERIAL_NOT_FOUND = 'MATERIAL_NOT_FOUND';
export const MATERIAL_NAME_IS_REQUIRED = 'MATERIAL_NAME_IS_REQUIRED';
export const MATERIAL_CODE_IS_REQUIRED = 'MATERIAL_CODE_IS_REQUIRED';
export const MATERIAL_CODE_INVALID = 'MATERIAL_CODE_INVALID';
export const MATERIAL_CODE_DOES_EXIST = 'MATERIAL_CODE_DOES_EXIST';
export const MATERIAL_CODE_RESERVED_BY_DELETED = 'MATERIAL_CODE_RESERVED_BY_DELETED';
export const MATERIAL_TYPE_SLUG_IS_REQUIRED = 'MATERIAL_TYPE_SLUG_IS_REQUIRED';
export const MATERIAL_MINIMUM_INVENTORY_INVALID = 'MATERIAL_MINIMUM_INVENTORY_INVALID';
export const MATERIAL_MAXIMUM_INVENTORY_INVALID = 'MATERIAL_MAXIMUM_INVENTORY_INVALID';
export const MATERIAL_INVENTORY_RANGE_INVALID = 'MATERIAL_INVENTORY_RANGE_INVALID';
export const MATERIAL_VERSION_IS_REQUIRED = 'MATERIAL_VERSION_IS_REQUIRED';
export const MATERIAL_IN_USE = 'MATERIAL_IN_USE';

export type TMaterialErrorCodeKey =
  | typeof MATERIAL_NOT_FOUND
  | typeof MATERIAL_NAME_IS_REQUIRED
  | typeof MATERIAL_CODE_IS_REQUIRED
  | typeof MATERIAL_CODE_INVALID
  | typeof MATERIAL_CODE_DOES_EXIST
  | typeof MATERIAL_CODE_RESERVED_BY_DELETED
  | typeof MATERIAL_TYPE_SLUG_IS_REQUIRED
  | typeof MATERIAL_MINIMUM_INVENTORY_INVALID
  | typeof MATERIAL_MAXIMUM_INVENTORY_INVALID
  | typeof MATERIAL_INVENTORY_RANGE_INVALID
  | typeof MATERIAL_VERSION_IS_REQUIRED
  | typeof MATERIAL_IN_USE;

export type TMaterialErrorCode = Record<TMaterialErrorCodeKey, TErrorCodeValue>;

// Material Error Code 1007xx

export const MaterialValidation: TMaterialErrorCode = {
  MATERIAL_NOT_FOUND: createErrorCode(100701, 'Material not found', HttpStatus.NOT_FOUND),
  MATERIAL_NAME_IS_REQUIRED: createErrorCode(
    100702,
    'Material name is required',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_CODE_IS_REQUIRED: createErrorCode(
    100703,
    'Material code is required',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_CODE_INVALID: createErrorCode(
    100704,
    'Material code must be 2-32 characters of letters, digits or hyphen (e.g. MAT-001)',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_CODE_DOES_EXIST: createErrorCode(100705, 'Material code does exist'),
  MATERIAL_CODE_RESERVED_BY_DELETED: createErrorCode(
    100706,
    'Material code is still held by a deleted material',
  ),
  MATERIAL_TYPE_SLUG_IS_REQUIRED: createErrorCode(
    100707,
    'typeSlug is required',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_MINIMUM_INVENTORY_INVALID: createErrorCode(
    100708,
    'minimumInventory must be an integer >= 0',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_MAXIMUM_INVENTORY_INVALID: createErrorCode(
    100709,
    'maximumInventory must be an integer >= 0',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_INVENTORY_RANGE_INVALID: createErrorCode(
    100710,
    'maximumInventory must be greater than or equal to minimumInventory',
  ),
  MATERIAL_VERSION_IS_REQUIRED: createErrorCode(
    100711,
    'Version is required and must be an integer >= 1',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_IN_USE: createErrorCode(
    100712,
    'Material is still assigned to warehouses - remove it from them first',
  ),
};
