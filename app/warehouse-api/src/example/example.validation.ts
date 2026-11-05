import { createErrorCode, TErrorCodeValue } from 'src/app/error-code.util';

export const EXAMPLE_NOT_FOUND = 'EXAMPLE_NOT_FOUND';
export const EXAMPLE_NAME_DOES_EXIST = 'EXAMPLE_NAME_DOES_EXIST';
export const EXAMPLE_NAME_IS_REQUIRED = 'EXAMPLE_NAME_IS_REQUIRED';
export const EXAMPLE_VERSION_INVALID = 'EXAMPLE_VERSION_INVALID';

export type TExampleErrorCodeKey =
  | typeof EXAMPLE_NOT_FOUND
  | typeof EXAMPLE_NAME_DOES_EXIST
  | typeof EXAMPLE_NAME_IS_REQUIRED
  | typeof EXAMPLE_VERSION_INVALID;

export type TExampleErrorCode = Record<TExampleErrorCodeKey, TErrorCodeValue>;

export const ExampleValidation: TExampleErrorCode = {
  EXAMPLE_NOT_FOUND: createErrorCode(999901, 'Example not found'),
  EXAMPLE_NAME_DOES_EXIST: createErrorCode(999902, 'Example name does exist'),
  EXAMPLE_NAME_IS_REQUIRED: createErrorCode(999903, 'Example name is required'),
  // `version` của `UpdateExampleRequestDto` (mẫu cho module phiếu `VersionedBase`): thiếu, không phải
  // số nguyên hoặc < 1 — 1 key cho mọi trường hợp.
  EXAMPLE_VERSION_INVALID: createErrorCode(
    999904,
    'version is required and must be an integer >= 1 (from the most recent GET)',
  ),
};
