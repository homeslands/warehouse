import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/error-code.util';

// Item Error Code 1015xx
export const ITEM_NOT_FOUND = 'ITEM_NOT_FOUND';
export const ITEM_INSUFFICIENT = 'ITEM_INSUFFICIENT';
export const ITEM_STATUS_INVALID = 'ITEM_STATUS_INVALID';
export const ITEM_EXPIRY_BEFORE_INVALID = 'ITEM_EXPIRY_BEFORE_INVALID';
export const ITEM_RESERVED_INVALID = 'ITEM_RESERVED_INVALID';

export type TItemErrorCodeKey =
  | typeof ITEM_NOT_FOUND
  | typeof ITEM_INSUFFICIENT
  | typeof ITEM_STATUS_INVALID
  | typeof ITEM_EXPIRY_BEFORE_INVALID
  | typeof ITEM_RESERVED_INVALID;

export type TItemErrorCode = Record<TItemErrorCodeKey, TErrorCodeValue>;

export const ItemValidation: TItemErrorCode = {
  ITEM_NOT_FOUND: createErrorCode(101501, 'Item not found', HttpStatus.NOT_FOUND),
  ITEM_INSUFFICIENT: createErrorCode(
    101502,
    'Not enough available quantity (remaining - reserved) in the items',
    HttpStatus.CONFLICT,
  ),
  ITEM_STATUS_INVALID: createErrorCode(
    101503,
    'Status must be one of the item lifecycle statuses',
    HttpStatus.BAD_REQUEST,
  ),
  ITEM_EXPIRY_BEFORE_INVALID: createErrorCode(
    101504,
    'expiryBefore must be a valid date in YYYY-MM-DD format',
    HttpStatus.BAD_REQUEST,
  ),
  ITEM_RESERVED_INVALID: createErrorCode(
    101505,
    'The reserved quantity of the item does not match the export form',
    HttpStatus.CONFLICT,
  ),
};
