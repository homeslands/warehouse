import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const MATERIAL_TYPE_NOT_FOUND = 'MATERIAL_TYPE_NOT_FOUND';
export const MATERIAL_TYPE_NAME_IS_REQUIRED = 'MATERIAL_TYPE_NAME_IS_REQUIRED';
export const MATERIAL_TYPE_NAME_DOES_EXIST = 'MATERIAL_TYPE_NAME_DOES_EXIST';
export const MATERIAL_TYPE_CODE_IS_REQUIRED = 'MATERIAL_TYPE_CODE_IS_REQUIRED';
export const MATERIAL_TYPE_CODE_INVALID = 'MATERIAL_TYPE_CODE_INVALID';
export const MATERIAL_TYPE_CODE_DOES_EXIST = 'MATERIAL_TYPE_CODE_DOES_EXIST';
export const MATERIAL_TYPE_CODE_RESERVED_BY_DELETED = 'MATERIAL_TYPE_CODE_RESERVED_BY_DELETED';
export const MATERIAL_TYPE_VERSION_IS_REQUIRED = 'MATERIAL_TYPE_VERSION_IS_REQUIRED';
export const MATERIAL_TYPE_IN_USE = 'MATERIAL_TYPE_IN_USE';

export type TMaterialTypeErrorCodeKey =
  | typeof MATERIAL_TYPE_NOT_FOUND
  | typeof MATERIAL_TYPE_NAME_IS_REQUIRED
  | typeof MATERIAL_TYPE_NAME_DOES_EXIST
  | typeof MATERIAL_TYPE_CODE_IS_REQUIRED
  | typeof MATERIAL_TYPE_CODE_INVALID
  | typeof MATERIAL_TYPE_CODE_DOES_EXIST
  | typeof MATERIAL_TYPE_CODE_RESERVED_BY_DELETED
  | typeof MATERIAL_TYPE_VERSION_IS_REQUIRED
  | typeof MATERIAL_TYPE_IN_USE;

export type TMaterialTypeErrorCode = Record<TMaterialTypeErrorCodeKey, TErrorCodeValue>;

// Material Type Error Code 1006xx

export const MaterialTypeValidation: TMaterialTypeErrorCode = {
  MATERIAL_TYPE_NOT_FOUND: createErrorCode(100601, 'Material type not found', HttpStatus.NOT_FOUND),
  MATERIAL_TYPE_NAME_IS_REQUIRED: createErrorCode(
    100602,
    'Material type name is required',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_TYPE_NAME_DOES_EXIST: createErrorCode(100603, 'Material type name does exist'),
  MATERIAL_TYPE_CODE_IS_REQUIRED: createErrorCode(
    100604,
    'Material type code is required',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_TYPE_CODE_INVALID: createErrorCode(
    100605,
    'Material type code must be 2-32 characters of letters, digits or hyphen (e.g. MT-01)',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_TYPE_CODE_DOES_EXIST: createErrorCode(100606, 'Material type code does exist'),
  MATERIAL_TYPE_CODE_RESERVED_BY_DELETED: createErrorCode(
    100607,
    'Material type code is still held by a deleted material type',
  ),
  MATERIAL_TYPE_VERSION_IS_REQUIRED: createErrorCode(
    100608,
    'Version is required and must be an integer',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_TYPE_IN_USE: createErrorCode(
    100609,
    'Material type is still referenced by materials - move or delete them first',
  ),
};
