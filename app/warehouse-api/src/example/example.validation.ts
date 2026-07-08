import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const EXAMPLE_NOT_FOUND = 'EXAMPLE_NOT_FOUND';
export const EXAMPLE_NAME_DOES_EXIST = 'EXAMPLE_NAME_DOES_EXIST';
export const EXAMPLE_NAME_IS_REQUIRED = 'EXAMPLE_NAME_IS_REQUIRED';

export type TExampleErrorCodeKey =
  typeof EXAMPLE_NOT_FOUND | typeof EXAMPLE_NAME_DOES_EXIST | typeof EXAMPLE_NAME_IS_REQUIRED;

export type TExampleErrorCode = Record<TExampleErrorCodeKey, TErrorCodeValue>;

export const ExampleValidation: TExampleErrorCode = {
  EXAMPLE_NOT_FOUND: createErrorCode(999901, 'Example not found'),
  EXAMPLE_NAME_DOES_EXIST: createErrorCode(999902, 'Example name does exist'),
  EXAMPLE_NAME_IS_REQUIRED: createErrorCode(999903, 'Example name is required'),
};
