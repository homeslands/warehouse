import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from './error-code.util';

export const DATA_VERSION_CONFLICT = 'DATA_VERSION_CONFLICT';

export const START_DATE_INVALID = 'START_DATE_INVALID';
export const END_DATE_INVALID = 'END_DATE_INVALID';
export const SORT_INVALID = 'SORT_INVALID';
export const SORT_BY_INVALID = 'SORT_BY_INVALID';
export const PAGE_INVALID = 'PAGE_INVALID';
export const SIZE_INVALID = 'SIZE_INVALID';

export type TAppCommonErrorCodeKey =
  | typeof DATA_VERSION_CONFLICT
  | typeof START_DATE_INVALID
  | typeof END_DATE_INVALID
  | typeof SORT_INVALID
  | typeof SORT_BY_INVALID
  | typeof PAGE_INVALID
  | typeof SIZE_INVALID;

export type TAppCommonErrorCode = Record<TAppCommonErrorCodeKey, TErrorCodeValue>;

// 100800 - 100900: mã lỗi dùng chung, không thuộc riêng module nào
export const AppCommonValidation: TAppCommonErrorCode = {
  DATA_VERSION_CONFLICT: createErrorCode(
    100800,
    'Data has been modified by another request, please reload and try again',
    HttpStatus.CONFLICT,
  ),
  // `BaseQueryDto` (`src/app/base.dto.ts`). 100801+ đã bị inventory dùng ⇒ nhảy lên 1008(5x).
  // Mọi key query dưới đây trả 422 (mặc định của `createErrorCode`) — issue #179 thống nhất 4 key
  // date/sort (trước đó 400) với page/size (#170) để status không phụ thuộc thứ tự field sai.
  START_DATE_INVALID: createErrorCode(
    100850,
    'startDate must be a valid date (YYYY-MM-DD or ISO 8601)',
  ),
  END_DATE_INVALID: createErrorCode(
    100851,
    'endDate must be a valid date (YYYY-MM-DD or ISO 8601)',
  ),
  // `BaseQueryDto.sort`.
  SORT_INVALID: createErrorCode(100852, 'sort must be ASC or DESC'),
  // `sortBy` của query DTO từng module (`<Module>SortBy`): sai giá trị enum (DTO) hoặc field mà
  // service không khai trong `buildSortOrder()`.
  SORT_BY_INVALID: createErrorCode(100853, 'sortBy is not supported by this endpoint'),
  // `BaseQueryDto.page` / `.size` (mọi list endpoint): không phải số nguyên hoặc < 1 (#170); `size`
  // còn bị chặn trên ở `MAX_PAGE_SIZE` = 500 (#179).
  PAGE_INVALID: createErrorCode(100854, 'page must be an integer >= 1'),
  SIZE_INVALID: createErrorCode(100855, 'size must be an integer between 1 and 500'),
};
