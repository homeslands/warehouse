import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/error-code.util';

// Code generate Error Code 1016xx
export const CODE_GENERATE_TRANSACTION_REQUIRED = 'CODE_GENERATE_TRANSACTION_REQUIRED';
export const CODE_GENERATE_WAREHOUSE_CODE_MISSING = 'CODE_GENERATE_WAREHOUSE_CODE_MISSING';
export const CODE_GENERATE_COUNT_INVALID = 'CODE_GENERATE_COUNT_INVALID';

export type TCodeGenerateErrorCodeKey =
  | typeof CODE_GENERATE_TRANSACTION_REQUIRED
  | typeof CODE_GENERATE_WAREHOUSE_CODE_MISSING
  | typeof CODE_GENERATE_COUNT_INVALID;

export type TCodeGenerateErrorCode = Record<TCodeGenerateErrorCodeKey, TErrorCodeValue>;

export const CodeGenerateValidation: TCodeGenerateErrorCode = {
  CODE_GENERATE_TRANSACTION_REQUIRED: createErrorCode(
    101601,
    'Code generation must run inside a transaction',
    HttpStatus.INTERNAL_SERVER_ERROR,
  ),
  CODE_GENERATE_WAREHOUSE_CODE_MISSING: createErrorCode(
    101602,
    'Warehouse has no code to build the generated code from',
  ),
  CODE_GENERATE_COUNT_INVALID: createErrorCode(
    101603,
    'Number of codes to generate must be a positive integer',
    HttpStatus.INTERNAL_SERVER_ERROR,
  ),
};
