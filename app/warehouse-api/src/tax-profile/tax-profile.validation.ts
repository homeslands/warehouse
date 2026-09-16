import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const TAX_PROFILE_NOT_FOUND = 'TAX_PROFILE_NOT_FOUND';
export const TAX_PROFILE_TAX_CODE_IS_REQUIRED = 'TAX_PROFILE_TAX_CODE_IS_REQUIRED';
export const TAX_PROFILE_TAX_CODE_INVALID = 'TAX_PROFILE_TAX_CODE_INVALID';
export const TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED = 'TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED';
export const TAX_PROFILE_NOT_FOUND_UPSTREAM = 'TAX_PROFILE_NOT_FOUND_UPSTREAM';
export const TAX_PROFILE_REJECTED_UPSTREAM = 'TAX_PROFILE_REJECTED_UPSTREAM';
export const TAX_PROFILE_LOOKUP_FAILED = 'TAX_PROFILE_LOOKUP_FAILED';

export type TTaxProfileErrorCodeKey =
  | typeof TAX_PROFILE_NOT_FOUND
  | typeof TAX_PROFILE_TAX_CODE_IS_REQUIRED
  | typeof TAX_PROFILE_TAX_CODE_INVALID
  | typeof TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED
  | typeof TAX_PROFILE_NOT_FOUND_UPSTREAM
  | typeof TAX_PROFILE_REJECTED_UPSTREAM
  | typeof TAX_PROFILE_LOOKUP_FAILED;

export type TTaxProfileErrorCode = Record<TTaxProfileErrorCodeKey, TErrorCodeValue>;

// Tax Profile Error Code 1011xx

export const TaxProfileValidation: TTaxProfileErrorCode = {
  TAX_PROFILE_NOT_FOUND: createErrorCode(
    101101,
    'Tax profile not found in the local cache',
    HttpStatus.NOT_FOUND,
  ),
  TAX_PROFILE_TAX_CODE_IS_REQUIRED: createErrorCode(
    101102,
    'Tax code is required',
    HttpStatus.BAD_REQUEST,
  ),
  TAX_PROFILE_TAX_CODE_INVALID: createErrorCode(
    101103,
    'Tax code must be 10 digits with an optional 3-digit branch suffix (e.g. 0101234567-001)',
    HttpStatus.BAD_REQUEST,
  ),
  TAX_PROFILE_BRANCH_CODE_NOT_SUPPORTED: createErrorCode(
    101104,
    'Branch tax codes (e.g. 0101234567-001) are not served by the tax lookup provider, use the 10-digit parent code',
    HttpStatus.BAD_REQUEST,
  ),
  TAX_PROFILE_NOT_FOUND_UPSTREAM: createErrorCode(
    101105,
    'Tax code does not exist in the tax authority registry',
    HttpStatus.NOT_FOUND,
  ),
  TAX_PROFILE_REJECTED_UPSTREAM: createErrorCode(
    101106,
    'Tax code was rejected as malformed by the tax lookup provider',
    HttpStatus.BAD_REQUEST,
  ),
  TAX_PROFILE_LOOKUP_FAILED: createErrorCode(
    101107,
    'Tax lookup provider is unavailable, please try again later',
    HttpStatus.BAD_GATEWAY,
  ),
};
