import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const AUTHORITY_NOT_FOUND = 'AUTHORITY_NOT_FOUND';
export const AUTHORITY_NOT_OWNED = 'AUTHORITY_NOT_OWNED';

export type TAuthorityErrorCodeKey = typeof AUTHORITY_NOT_FOUND | typeof AUTHORITY_NOT_OWNED;

export type TAuthorityErrorCode = Record<TAuthorityErrorCodeKey, TErrorCodeValue>;

export const AuthorityValidation: TAuthorityErrorCode = {
  AUTHORITY_NOT_FOUND: createErrorCode(100201, 'Authority not found'),
  AUTHORITY_NOT_OWNED: createErrorCode(
    100202,
    'Cannot grant an authority your own role does not have',
    HttpStatus.FORBIDDEN,
  ),
};
