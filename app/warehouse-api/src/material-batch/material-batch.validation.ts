import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

// Material batch Error Code 1015xx
export const MATERIAL_BATCH_NOT_FOUND = 'MATERIAL_BATCH_NOT_FOUND';
export const MATERIAL_BATCH_INSUFFICIENT = 'MATERIAL_BATCH_INSUFFICIENT';
export const MATERIAL_BATCH_STATUS_INVALID = 'MATERIAL_BATCH_STATUS_INVALID';
export const MATERIAL_BATCH_EXPIRY_BEFORE_INVALID = 'MATERIAL_BATCH_EXPIRY_BEFORE_INVALID';
export const MATERIAL_BATCH_RESERVED_INVALID = 'MATERIAL_BATCH_RESERVED_INVALID';

export type TMaterialBatchErrorCodeKey =
  | typeof MATERIAL_BATCH_NOT_FOUND
  | typeof MATERIAL_BATCH_INSUFFICIENT
  | typeof MATERIAL_BATCH_STATUS_INVALID
  | typeof MATERIAL_BATCH_EXPIRY_BEFORE_INVALID
  | typeof MATERIAL_BATCH_RESERVED_INVALID;

export type TMaterialBatchErrorCode = Record<TMaterialBatchErrorCodeKey, TErrorCodeValue>;

export const MaterialBatchValidation: TMaterialBatchErrorCode = {
  MATERIAL_BATCH_NOT_FOUND: createErrorCode(
    101501,
    'Material batch not found',
    HttpStatus.NOT_FOUND,
  ),
  MATERIAL_BATCH_INSUFFICIENT: createErrorCode(
    101502,
    'Not enough available quantity (remaining - reserved) in the material batches',
    HttpStatus.CONFLICT,
  ),
  MATERIAL_BATCH_STATUS_INVALID: createErrorCode(
    101503,
    'Status must be 0 (out of stock) or 1 (in stock)',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_BATCH_EXPIRY_BEFORE_INVALID: createErrorCode(
    101504,
    'expiryBefore must be a valid date in YYYY-MM-DD format',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_BATCH_RESERVED_INVALID: createErrorCode(
    101505,
    'The reserved quantity of the material batch does not match the export form',
    HttpStatus.CONFLICT,
  ),
};
