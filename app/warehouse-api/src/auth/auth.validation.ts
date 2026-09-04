import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
export const USER_NOT_ACTIVE = 'USER_NOT_ACTIVE';
export const REFRESH_TOKEN_REVOKED = 'REFRESH_TOKEN_REVOKED';
export const REFRESH_TOKEN_REUSED = 'REFRESH_TOKEN_REUSED';
export const SESSION_EXPIRED = 'SESSION_EXPIRED';
export const INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN';
export const REFRESH_TOKEN_EXPIRED = 'REFRESH_TOKEN_EXPIRED';
export const PHONENUMBER_IS_REQUIRED = 'PHONENUMBER_IS_REQUIRED';
export const PASSWORD_IS_REQUIRED = 'PASSWORD_IS_REQUIRED';
export const REFRESH_TOKEN_IS_REQUIRED = 'REFRESH_TOKEN_IS_REQUIRED';

export type TAuthErrorCodeKey =
  | typeof INVALID_CREDENTIALS
  | typeof USER_NOT_ACTIVE
  | typeof REFRESH_TOKEN_REVOKED
  | typeof REFRESH_TOKEN_REUSED
  | typeof SESSION_EXPIRED
  | typeof INVALID_REFRESH_TOKEN
  | typeof REFRESH_TOKEN_EXPIRED
  | typeof PHONENUMBER_IS_REQUIRED
  | typeof PASSWORD_IS_REQUIRED
  | typeof REFRESH_TOKEN_IS_REQUIRED;

export type TAuthErrorCode = Record<TAuthErrorCodeKey, TErrorCodeValue>;

export const AuthValidation: TAuthErrorCode = {
  INVALID_CREDENTIALS: createErrorCode(
    100001,
    'Invalid phone number or password',
    HttpStatus.UNAUTHORIZED,
  ),
  USER_NOT_ACTIVE: createErrorCode(100002, 'User is not active', HttpStatus.FORBIDDEN),
  REFRESH_TOKEN_REVOKED: createErrorCode(
    100005,
    'Session has been logged out, please login again',
    HttpStatus.UNAUTHORIZED,
  ),
  REFRESH_TOKEN_REUSED: createErrorCode(
    100009,
    'Refresh token reuse detected, the session has been revoked',
    HttpStatus.UNAUTHORIZED,
  ),
  SESSION_EXPIRED: createErrorCode(
    100010,
    'Session has expired, please login again',
    HttpStatus.UNAUTHORIZED,
  ),
  INVALID_REFRESH_TOKEN: createErrorCode(100003, 'Invalid refresh token', HttpStatus.UNAUTHORIZED),
  REFRESH_TOKEN_EXPIRED: createErrorCode(
    100004,
    'Refresh token has expired',
    HttpStatus.UNAUTHORIZED,
  ),
  PHONENUMBER_IS_REQUIRED: createErrorCode(
    100006,
    'Phone number is required',
    HttpStatus.BAD_REQUEST,
  ),
  PASSWORD_IS_REQUIRED: createErrorCode(100007, 'Password is required', HttpStatus.BAD_REQUEST),
  REFRESH_TOKEN_IS_REQUIRED: createErrorCode(
    100008,
    'Refresh token is required',
    HttpStatus.BAD_REQUEST,
  ),
};
