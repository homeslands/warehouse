import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const AUTHORITY_NOT_FOUND = 'AUTHORITY_NOT_FOUND';

export type TAuthorityErrorCodeKey = typeof AUTHORITY_NOT_FOUND;

export type TAuthorityErrorCode = Record<TAuthorityErrorCodeKey, TErrorCodeValue>;

export const AuthorityValidation: TAuthorityErrorCode = {
  AUTHORITY_NOT_FOUND: createErrorCode(100201, 'Authority not found'),
};
