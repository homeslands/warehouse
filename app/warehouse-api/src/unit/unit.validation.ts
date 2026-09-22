import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const UNIT_NOT_FOUND = 'UNIT_NOT_FOUND';
export const UNIT_NAME_IS_REQUIRED = 'UNIT_NAME_IS_REQUIRED';
export const UNIT_NAME_DOES_EXIST = 'UNIT_NAME_DOES_EXIST';
export const UNIT_CODE_IS_REQUIRED = 'UNIT_CODE_IS_REQUIRED';
export const UNIT_CODE_INVALID = 'UNIT_CODE_INVALID';
export const UNIT_CODE_DOES_EXIST = 'UNIT_CODE_DOES_EXIST';
export const UNIT_CODE_RESERVED_BY_DELETED = 'UNIT_CODE_RESERVED_BY_DELETED';
export const UNIT_VERSION_IS_REQUIRED = 'UNIT_VERSION_IS_REQUIRED';
export const UNIT_IN_USE = 'UNIT_IN_USE';

export type TUnitErrorCodeKey =
  | typeof UNIT_NOT_FOUND
  | typeof UNIT_NAME_IS_REQUIRED
  | typeof UNIT_NAME_DOES_EXIST
  | typeof UNIT_CODE_IS_REQUIRED
  | typeof UNIT_CODE_INVALID
  | typeof UNIT_CODE_DOES_EXIST
  | typeof UNIT_CODE_RESERVED_BY_DELETED
  | typeof UNIT_VERSION_IS_REQUIRED
  | typeof UNIT_IN_USE;

export type TUnitErrorCode = Record<TUnitErrorCodeKey, TErrorCodeValue>;

// Unit Error Code 1009xx (1008xx đã thuộc warehouse-material)

export const UnitValidation: TUnitErrorCode = {
  UNIT_NOT_FOUND: createErrorCode(100901, 'Unit not found', HttpStatus.NOT_FOUND),
  UNIT_NAME_IS_REQUIRED: createErrorCode(100902, 'Unit name is required', HttpStatus.BAD_REQUEST),
  UNIT_NAME_DOES_EXIST: createErrorCode(100903, 'Unit name does exist'),
  UNIT_CODE_IS_REQUIRED: createErrorCode(100904, 'Unit code is required', HttpStatus.BAD_REQUEST),
  UNIT_CODE_INVALID: createErrorCode(
    100905,
    'Unit code must be 2-32 characters of letters, digits or hyphen (e.g. KG)',
    HttpStatus.BAD_REQUEST,
  ),
  UNIT_CODE_DOES_EXIST: createErrorCode(100906, 'Unit code does exist'),
  UNIT_CODE_RESERVED_BY_DELETED: createErrorCode(
    100907,
    'Unit code is still held by a deleted unit',
  ),
  UNIT_VERSION_IS_REQUIRED: createErrorCode(
    100908,
    'Version is required and must be an integer >= 1',
    HttpStatus.BAD_REQUEST,
  ),
  UNIT_IN_USE: createErrorCode(100909, 'Unit is still referenced by materials - detach them first'),
};
