import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from './app.validation';

export const DATA_VERSION_CONFLICT = 'DATA_VERSION_CONFLICT';

export const START_DATE_INVALID = 'START_DATE_INVALID';
export const END_DATE_INVALID = 'END_DATE_INVALID';
export const SORT_INVALID = 'SORT_INVALID';
export const SORT_BY_INVALID = 'SORT_BY_INVALID';

export type TAppCommonErrorCodeKey =
  | typeof DATA_VERSION_CONFLICT
  | typeof START_DATE_INVALID
  | typeof END_DATE_INVALID
  | typeof SORT_INVALID
  | typeof SORT_BY_INVALID;

export type TAppCommonErrorCode = Record<TAppCommonErrorCodeKey, TErrorCodeValue>;

// 100800 - 100900: mã lỗi dùng chung, không thuộc riêng module nào
export const AppCommonValidation: TAppCommonErrorCode = {
  DATA_VERSION_CONFLICT: createErrorCode(
    100800,
    'Data has been modified by another request, please reload and try again',
    HttpStatus.CONFLICT,
  ),
  // `PaginationQueryDto` (`src/app/base.dto.ts`). 100801+ đã bị inventory dùng ⇒ nhảy lên 1008(5x).
  START_DATE_INVALID: createErrorCode(
    100850,
    'startDate must be a valid date (YYYY-MM-DD or ISO 8601)',
    HttpStatus.BAD_REQUEST,
  ),
  END_DATE_INVALID: createErrorCode(
    100851,
    'endDate must be a valid date (YYYY-MM-DD or ISO 8601)',
    HttpStatus.BAD_REQUEST,
  ),
  // `BaseQueryDto.sort`.
  SORT_INVALID: createErrorCode(100852, 'sort must be ASC or DESC', HttpStatus.BAD_REQUEST),
  // `sortBy` của query DTO từng module (`<Module>SortBy`): sai giá trị enum (DTO) hoặc field mà
  // service không khai trong `buildSortOrder()`.
  SORT_BY_INVALID: createErrorCode(
    100853,
    'sortBy is not supported by this endpoint',
    HttpStatus.BAD_REQUEST,
  ),
};
