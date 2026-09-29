import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const AUTHORITY_NOT_FOUND = 'AUTHORITY_NOT_FOUND';
export const AUTHORITY_NOT_OWNED = 'AUTHORITY_NOT_OWNED';
export const AUTHORITY_NOT_DELEGABLE = 'AUTHORITY_NOT_DELEGABLE';

export type TAuthorityErrorCodeKey =
  typeof AUTHORITY_NOT_FOUND | typeof AUTHORITY_NOT_OWNED | typeof AUTHORITY_NOT_DELEGABLE;

export type TAuthorityErrorCode = Record<TAuthorityErrorCodeKey, TErrorCodeValue>;

export const AuthorityValidation: TAuthorityErrorCode = {
  AUTHORITY_NOT_FOUND: createErrorCode(100201, 'Authority not found'),
  AUTHORITY_NOT_OWNED: createErrorCode(
    100202,
    'Cannot grant an authority your own role does not have',
    HttpStatus.FORBIDDEN,
  ),
  AUTHORITY_NOT_DELEGABLE: createErrorCode(
    100203,
    'This authority can only be granted to the ADMIN role',
    HttpStatus.FORBIDDEN,
  ),
};
