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
export const MATERIAL_IN_USE = 'MATERIAL_IN_USE';
export const MATERIAL_BASE_UNIT_IS_REQUIRED = 'MATERIAL_BASE_UNIT_IS_REQUIRED';
export const MATERIAL_UNIT_SLUG_IS_REQUIRED = 'MATERIAL_UNIT_SLUG_IS_REQUIRED';
export const MATERIAL_CONVERSION_UNIT_DOES_EXIST = 'MATERIAL_CONVERSION_UNIT_DOES_EXIST';
export const MATERIAL_CONVERSION_UNIT_NOT_FOUND = 'MATERIAL_CONVERSION_UNIT_NOT_FOUND';
export const MATERIAL_CONVERSION_RATE_INVALID = 'MATERIAL_CONVERSION_RATE_INVALID';
export const MATERIAL_CONVERT_QUANTITY_INVALID = 'MATERIAL_CONVERT_QUANTITY_INVALID';
export const MATERIAL_BASE_UNIT_RATE_IS_FIXED = 'MATERIAL_BASE_UNIT_RATE_IS_FIXED';
export const MATERIAL_BASE_UNIT_CANNOT_BE_DETACHED = 'MATERIAL_BASE_UNIT_CANNOT_BE_DETACHED';
export const MATERIAL_BASE_UNIT_LOCKED = 'MATERIAL_BASE_UNIT_LOCKED';
export const MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED = 'MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED';
export const MATERIAL_SUPPLIER_SLUGS_INVALID = 'MATERIAL_SUPPLIER_SLUGS_INVALID';
export const MATERIAL_HAS_SUPPLIER_INVALID = 'MATERIAL_HAS_SUPPLIER_INVALID';
export const MATERIAL_START_DATE_INVALID = 'MATERIAL_START_DATE_INVALID';
export const MATERIAL_END_DATE_INVALID = 'MATERIAL_END_DATE_INVALID';
export const MATERIAL_DATE_RANGE_INVALID = 'MATERIAL_DATE_RANGE_INVALID';
export const MATERIAL_SORT_INVALID = 'MATERIAL_SORT_INVALID';
export const MATERIAL_NAME_SEARCH_INVALID = 'MATERIAL_NAME_SEARCH_INVALID';
export const MATERIAL_CODE_SEARCH_INVALID = 'MATERIAL_CODE_SEARCH_INVALID';

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
  | typeof MATERIAL_IN_USE
  | typeof MATERIAL_BASE_UNIT_IS_REQUIRED
  | typeof MATERIAL_UNIT_SLUG_IS_REQUIRED
  | typeof MATERIAL_CONVERSION_UNIT_DOES_EXIST
  | typeof MATERIAL_CONVERSION_UNIT_NOT_FOUND
  | typeof MATERIAL_CONVERSION_RATE_INVALID
  | typeof MATERIAL_CONVERT_QUANTITY_INVALID
  | typeof MATERIAL_BASE_UNIT_RATE_IS_FIXED
  | typeof MATERIAL_BASE_UNIT_CANNOT_BE_DETACHED
  | typeof MATERIAL_BASE_UNIT_LOCKED
  | typeof MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED
  | typeof MATERIAL_HAS_SUPPLIER_INVALID
  | typeof MATERIAL_SUPPLIER_SLUGS_INVALID
  | typeof MATERIAL_START_DATE_INVALID
  | typeof MATERIAL_END_DATE_INVALID
  | typeof MATERIAL_DATE_RANGE_INVALID
  | typeof MATERIAL_SORT_INVALID
  | typeof MATERIAL_NAME_SEARCH_INVALID
  | typeof MATERIAL_CODE_SEARCH_INVALID;

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
  MATERIAL_IN_USE: createErrorCode(
    100712,
    'Material is still assigned to warehouses - remove it from them first',
  ),
  // 100713 bỏ trống có chủ ý: từng là `MATERIAL_BASE_UNIT_IS_CONVERSION_UNIT` của mô hình cũ (base
  // unit nằm NGOÀI bảng join). Nay base unit chính là 1 dòng trong bảng join nên rào đó vô nghĩa —
  // gắn lại đơn vị cơ sở rơi vào `MATERIAL_CONVERSION_UNIT_DOES_EXIST`.
  MATERIAL_BASE_UNIT_IS_REQUIRED: createErrorCode(
    100714,
    'Material must have a base unit before conversion units can be attached',
  ),
  MATERIAL_UNIT_SLUG_IS_REQUIRED: createErrorCode(
    100715,
    'unitSlug is required',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_CONVERSION_UNIT_DOES_EXIST: createErrorCode(
    100716,
    'This unit is already a conversion unit of the material - use PATCH to change its rate',
  ),
  MATERIAL_CONVERSION_UNIT_NOT_FOUND: createErrorCode(
    100717,
    'This unit is not a conversion unit of the material',
    HttpStatus.NOT_FOUND,
  ),
  MATERIAL_CONVERSION_RATE_INVALID: createErrorCode(
    100718,
    'conversionRate must be a number greater than 0 (max 6 decimal places)',
    HttpStatus.BAD_REQUEST,
  ),
  // 100719 bỏ trống có chủ ý: từng là `MATERIAL_CONVERSION_QUANTITY_INVALID` của cột `quantity`
  // trên bảng join, cột đó đã bị gỡ. Không tái sử dụng số cũ để log/client cũ không hiểu nhầm.
  MATERIAL_CONVERT_QUANTITY_INVALID: createErrorCode(
    100720,
    'quantity to convert must be a number >= 0 (max 6 decimal places)',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_BASE_UNIT_RATE_IS_FIXED: createErrorCode(
    100721,
    'Conversion rate of the base unit is always 1 and cannot be changed',
  ),
  MATERIAL_BASE_UNIT_CANNOT_BE_DETACHED: createErrorCode(
    100722,
    'Base unit cannot be detached - change the base unit of the material first',
  ),
  MATERIAL_BASE_UNIT_LOCKED: createErrorCode(
    100723,
    'Base unit can no longer be changed: the material already has stock or other conversion units',
  ),
  MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED: createErrorCode(100724, 'baseUnitSlug is required'),
  MATERIAL_HAS_SUPPLIER_INVALID: createErrorCode(100725, 'hasSupplier must be true or false'),
  MATERIAL_SUPPLIER_SLUGS_INVALID: createErrorCode(
    100726,
    'supplierSlugs must be an array of at most 50 non-empty strings',
  ),
  MATERIAL_START_DATE_INVALID: createErrorCode(
    100727,
    'startDate must be a valid date (YYYY-MM-DD or ISO 8601)',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_END_DATE_INVALID: createErrorCode(
    100728,
    'endDate must be a valid date (YYYY-MM-DD or ISO 8601)',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_DATE_RANGE_INVALID: createErrorCode(
    100729,
    'startDate must not be after endDate',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_SORT_INVALID: createErrorCode(
    100730,
    'sort must be ASC or DESC',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_NAME_SEARCH_INVALID: createErrorCode(
    100731,
    'name may only contain letters, digits and spaces',
    HttpStatus.BAD_REQUEST,
  ),
  MATERIAL_CODE_SEARCH_INVALID: createErrorCode(
    100732,
    'code may only contain letters, digits, "_" and "-"',
    HttpStatus.BAD_REQUEST,
  ),
};
