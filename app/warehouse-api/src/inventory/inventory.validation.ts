import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const INVENTORY_NOT_FOUND = 'INVENTORY_NOT_FOUND';
export const INVENTORY_DOES_EXIST = 'INVENTORY_DOES_EXIST';
export const INVENTORY_SLUG_IS_REQUIRED = 'INVENTORY_SLUG_IS_REQUIRED';
export const INVENTORY_WAREHOUSE_INACTIVE = 'INVENTORY_WAREHOUSE_INACTIVE';
export const INVENTORY_QUANTITY_INVALID = 'INVENTORY_QUANTITY_INVALID';
export const INVENTORY_QUANTITY_NEGATIVE = 'INVENTORY_QUANTITY_NEGATIVE';
export const INVENTORY_QUANTITY_NOT_EMPTY = 'INVENTORY_QUANTITY_NOT_EMPTY';
export const INVENTORY_DELTA_INVALID = 'INVENTORY_DELTA_INVALID';
export const INVENTORY_MINIMUM_INVENTORY_INVALID = 'INVENTORY_MINIMUM_INVENTORY_INVALID';
export const INVENTORY_MAXIMUM_INVENTORY_INVALID = 'INVENTORY_MAXIMUM_INVENTORY_INVALID';
export const INVENTORY_RANGE_INVALID = 'INVENTORY_RANGE_INVALID';
export const INVENTORY_QUANTITY_BELOW_RESERVED = 'INVENTORY_QUANTITY_BELOW_RESERVED';
export const INVENTORY_RESERVED_NOT_EMPTY = 'INVENTORY_RESERVED_NOT_EMPTY';
export const INVENTORY_NOTE_INVALID = 'INVENTORY_NOTE_INVALID';

export type TInventoryErrorCodeKey =
  | typeof INVENTORY_NOT_FOUND
  | typeof INVENTORY_DOES_EXIST
  | typeof INVENTORY_SLUG_IS_REQUIRED
  | typeof INVENTORY_WAREHOUSE_INACTIVE
  | typeof INVENTORY_QUANTITY_INVALID
  | typeof INVENTORY_QUANTITY_NEGATIVE
  | typeof INVENTORY_QUANTITY_NOT_EMPTY
  | typeof INVENTORY_DELTA_INVALID
  | typeof INVENTORY_MINIMUM_INVENTORY_INVALID
  | typeof INVENTORY_MAXIMUM_INVENTORY_INVALID
  | typeof INVENTORY_RANGE_INVALID
  | typeof INVENTORY_QUANTITY_BELOW_RESERVED
  | typeof INVENTORY_RESERVED_NOT_EMPTY
  | typeof INVENTORY_NOTE_INVALID;

export type TInventoryErrorCode = Record<TInventoryErrorCodeKey, TErrorCodeValue>;

// Inventory Error Code 1008xx

export const InventoryValidation: TInventoryErrorCode = {
  INVENTORY_NOT_FOUND: createErrorCode(
    100801,
    'Material is not assigned to this warehouse',
    HttpStatus.NOT_FOUND,
  ),
  INVENTORY_DOES_EXIST: createErrorCode(100802, 'Material is already assigned to this warehouse'),
  INVENTORY_SLUG_IS_REQUIRED: createErrorCode(
    100803,
    'materialSlug is required',
    HttpStatus.BAD_REQUEST,
  ),
  INVENTORY_WAREHOUSE_INACTIVE: createErrorCode(
    100804,
    'Cannot manage materials of an inactive warehouse',
  ),
  INVENTORY_QUANTITY_INVALID: createErrorCode(
    100805,
    'quantity must be an integer >= 0',
    HttpStatus.BAD_REQUEST,
  ),
  INVENTORY_QUANTITY_NEGATIVE: createErrorCode(
    100806,
    'The adjustment would make the stock quantity negative',
  ),
  INVENTORY_QUANTITY_NOT_EMPTY: createErrorCode(
    100807,
    'Stock quantity must be 0 before removing the material from the warehouse',
  ),
  INVENTORY_DELTA_INVALID: createErrorCode(
    100808,
    'delta must be a non-zero integer',
    HttpStatus.BAD_REQUEST,
  ),
  INVENTORY_MINIMUM_INVENTORY_INVALID: createErrorCode(
    100809,
    'minimumInventory must be an integer >= 0, or null to fall back to the material default',
    HttpStatus.BAD_REQUEST,
  ),
  INVENTORY_MAXIMUM_INVENTORY_INVALID: createErrorCode(
    100810,
    'maximumInventory must be an integer >= 0, or null to fall back to the material default',
    HttpStatus.BAD_REQUEST,
  ),
  INVENTORY_RANGE_INVALID: createErrorCode(
    100811,
    'The effective maximumInventory must be greater than or equal to the effective minimumInventory',
  ),
  INVENTORY_QUANTITY_BELOW_RESERVED: createErrorCode(
    100812,
    'The adjustment would make the stock quantity lower than the reserved quantity',
  ),
  INVENTORY_RESERVED_NOT_EMPTY: createErrorCode(
    100813,
    'Reserved quantity must be 0 before removing the material from the warehouse',
  ),
  INVENTORY_NOTE_INVALID: createErrorCode(
    100814,
    'note must be a string of at most 255 characters',
    HttpStatus.BAD_REQUEST,
  ),
};
