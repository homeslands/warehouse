import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const EXPORT_DATABASE_ERROR = 'EXPORT_DATABASE_ERROR';

export type TDbErrorCodeKey = typeof EXPORT_DATABASE_ERROR;

export type TDbErrorCode = Record<TDbErrorCodeKey, TErrorCodeValue>;

// 109000 - 109099
export const DbValidation: TDbErrorCode = {
  EXPORT_DATABASE_ERROR: createErrorCode(109000, 'Export database error'),
};
