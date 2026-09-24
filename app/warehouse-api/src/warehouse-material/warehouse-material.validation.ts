import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const WAREHOUSE_MATERIAL_NOT_FOUND = 'WAREHOUSE_MATERIAL_NOT_FOUND';
export const WAREHOUSE_MATERIAL_DOES_EXIST = 'WAREHOUSE_MATERIAL_DOES_EXIST';
export const WAREHOUSE_MATERIAL_SLUG_IS_REQUIRED = 'WAREHOUSE_MATERIAL_SLUG_IS_REQUIRED';
export const WAREHOUSE_MATERIAL_WAREHOUSE_INACTIVE = 'WAREHOUSE_MATERIAL_WAREHOUSE_INACTIVE';
export const WAREHOUSE_MATERIAL_QUANTITY_INVALID = 'WAREHOUSE_MATERIAL_QUANTITY_INVALID';
export const WAREHOUSE_MATERIAL_QUANTITY_NEGATIVE = 'WAREHOUSE_MATERIAL_QUANTITY_NEGATIVE';
export const WAREHOUSE_MATERIAL_QUANTITY_NOT_EMPTY = 'WAREHOUSE_MATERIAL_QUANTITY_NOT_EMPTY';
export const WAREHOUSE_MATERIAL_DELTA_INVALID = 'WAREHOUSE_MATERIAL_DELTA_INVALID';
export const WAREHOUSE_MATERIAL_MINIMUM_INVENTORY_INVALID =
  'WAREHOUSE_MATERIAL_MINIMUM_INVENTORY_INVALID';
export const WAREHOUSE_MATERIAL_MAXIMUM_INVENTORY_INVALID =
  'WAREHOUSE_MATERIAL_MAXIMUM_INVENTORY_INVALID';
export const WAREHOUSE_MATERIAL_INVENTORY_RANGE_INVALID =
  'WAREHOUSE_MATERIAL_INVENTORY_RANGE_INVALID';

export type TWarehouseMaterialErrorCodeKey =
  | typeof WAREHOUSE_MATERIAL_NOT_FOUND
  | typeof WAREHOUSE_MATERIAL_DOES_EXIST
  | typeof WAREHOUSE_MATERIAL_SLUG_IS_REQUIRED
  | typeof WAREHOUSE_MATERIAL_WAREHOUSE_INACTIVE
  | typeof WAREHOUSE_MATERIAL_QUANTITY_INVALID
  | typeof WAREHOUSE_MATERIAL_QUANTITY_NEGATIVE
  | typeof WAREHOUSE_MATERIAL_QUANTITY_NOT_EMPTY
  | typeof WAREHOUSE_MATERIAL_DELTA_INVALID
  | typeof WAREHOUSE_MATERIAL_MINIMUM_INVENTORY_INVALID
  | typeof WAREHOUSE_MATERIAL_MAXIMUM_INVENTORY_INVALID
  | typeof WAREHOUSE_MATERIAL_INVENTORY_RANGE_INVALID;

export type TWarehouseMaterialErrorCode = Record<TWarehouseMaterialErrorCodeKey, TErrorCodeValue>;

// Warehouse Material Error Code 1008xx

export const WarehouseMaterialValidation: TWarehouseMaterialErrorCode = {
  WAREHOUSE_MATERIAL_NOT_FOUND: createErrorCode(
    100801,
    'Material is not assigned to this warehouse',
    HttpStatus.NOT_FOUND,
  ),
  WAREHOUSE_MATERIAL_DOES_EXIST: createErrorCode(
    100802,
    'Material is already assigned to this warehouse',
  ),
  WAREHOUSE_MATERIAL_SLUG_IS_REQUIRED: createErrorCode(
    100803,
    'materialSlug is required',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_MATERIAL_WAREHOUSE_INACTIVE: createErrorCode(
    100804,
    'Cannot manage materials of an inactive warehouse',
  ),
  WAREHOUSE_MATERIAL_QUANTITY_INVALID: createErrorCode(
    100805,
    'quantity must be an integer >= 0',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_MATERIAL_QUANTITY_NEGATIVE: createErrorCode(
    100806,
    'The adjustment would make the stock quantity negative',
  ),
  WAREHOUSE_MATERIAL_QUANTITY_NOT_EMPTY: createErrorCode(
    100807,
    'Stock quantity must be 0 before removing the material from the warehouse',
  ),
  WAREHOUSE_MATERIAL_DELTA_INVALID: createErrorCode(
    100808,
    'delta must be a non-zero integer',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_MATERIAL_MINIMUM_INVENTORY_INVALID: createErrorCode(
    100809,
    'minimumInventory must be an integer >= 0, or null to fall back to the material default',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_MATERIAL_MAXIMUM_INVENTORY_INVALID: createErrorCode(
    100810,
    'maximumInventory must be an integer >= 0, or null to fall back to the material default',
    HttpStatus.BAD_REQUEST,
  ),
  WAREHOUSE_MATERIAL_INVENTORY_RANGE_INVALID: createErrorCode(
    100811,
    'The effective maximumInventory must be greater than or equal to the effective minimumInventory',
  ),
};
