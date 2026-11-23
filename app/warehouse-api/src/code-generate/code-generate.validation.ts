import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/error-code.util';

// Code generate Error Code 1016xx
export const CODE_GENERATE_TRANSACTION_REQUIRED = 'CODE_GENERATE_TRANSACTION_REQUIRED';
export const CODE_GENERATE_WAREHOUSE_CODE_MISSING = 'CODE_GENERATE_WAREHOUSE_CODE_MISSING';
export const CODE_GENERATE_COUNT_INVALID = 'CODE_GENERATE_COUNT_INVALID';
export const CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED = 'CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED';
export const CODE_GENERATE_BARCODE_EXHAUSTED = 'CODE_GENERATE_BARCODE_EXHAUSTED';
export const CODE_RULE_NOT_FOUND = 'CODE_RULE_NOT_FOUND';
export const CODE_RULE_PREFIX_INVALID = 'CODE_RULE_PREFIX_INVALID';
export const CODE_RULE_TYPE_INVALID = 'CODE_RULE_TYPE_INVALID';
export const CODE_RULE_DESCRIPTION_INVALID = 'CODE_RULE_DESCRIPTION_INVALID';

export type TCodeGenerateErrorCodeKey =
  | typeof CODE_GENERATE_TRANSACTION_REQUIRED
  | typeof CODE_GENERATE_WAREHOUSE_CODE_MISSING
  | typeof CODE_GENERATE_COUNT_INVALID
  | typeof CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED
  | typeof CODE_GENERATE_BARCODE_EXHAUSTED
  | typeof CODE_RULE_NOT_FOUND
  | typeof CODE_RULE_PREFIX_INVALID
  | typeof CODE_RULE_TYPE_INVALID
  | typeof CODE_RULE_DESCRIPTION_INVALID;

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
  CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED: createErrorCode(
    101604,
    'Barcodes support at most 999 warehouses',
  ),
  CODE_GENERATE_BARCODE_EXHAUSTED: createErrorCode(
    101605,
    'Barcode sequence of this warehouse is exhausted (max 9999999)',
  ),
  CODE_RULE_NOT_FOUND: createErrorCode(101606, 'Code rule not found', HttpStatus.NOT_FOUND),
  CODE_RULE_PREFIX_INVALID: createErrorCode(
    101607,
    'prefix must be 2 uppercase letters/digits (BARCODE: exactly 2 digits)',
    HttpStatus.BAD_REQUEST,
  ),
  CODE_RULE_TYPE_INVALID: createErrorCode(101608, 'Unknown code type', HttpStatus.BAD_REQUEST),
  CODE_RULE_DESCRIPTION_INVALID: createErrorCode(
    101609,
    'description must be a string of at most 255 characters',
    HttpStatus.BAD_REQUEST,
  ),
};
