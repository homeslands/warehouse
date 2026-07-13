import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const AUTHORITY_GROUP_NOT_FOUND = 'AUTHORITY_GROUP_NOT_FOUND';

export type TAuthorityGroupErrorCodeKey = typeof AUTHORITY_GROUP_NOT_FOUND;

export type TAuthorityGroupErrorCode = Record<TAuthorityGroupErrorCodeKey, TErrorCodeValue>;

export const AuthorityGroupValidation: TAuthorityGroupErrorCode = {
  AUTHORITY_GROUP_NOT_FOUND: createErrorCode(100301, 'Authority group not found'),
};
