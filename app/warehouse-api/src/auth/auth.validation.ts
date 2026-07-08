import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
export const USER_NOT_ACTIVE = 'USER_NOT_ACTIVE';
export const PHONENUMBER_DOES_EXIST = 'PHONENUMBER_DOES_EXIST';
export const PHONENUMBER_IS_REQUIRED = 'PHONENUMBER_IS_REQUIRED';
export const PASSWORD_IS_REQUIRED = 'PASSWORD_IS_REQUIRED';

export type TAuthErrorCodeKey =
  | typeof INVALID_CREDENTIALS
  | typeof USER_NOT_ACTIVE
  | typeof PHONENUMBER_DOES_EXIST
  | typeof PHONENUMBER_IS_REQUIRED
  | typeof PASSWORD_IS_REQUIRED;

export type TAuthErrorCode = Record<TAuthErrorCodeKey, TErrorCodeValue>;

export const AuthValidation: TAuthErrorCode = {
  INVALID_CREDENTIALS: createErrorCode(
    100001,
    'Invalid phone number or password',
    HttpStatus.UNAUTHORIZED,
  ),
  USER_NOT_ACTIVE: createErrorCode(100002, 'User is not active', HttpStatus.FORBIDDEN),
  PHONENUMBER_DOES_EXIST: createErrorCode(100005, 'Phone number already exists'),
  PHONENUMBER_IS_REQUIRED: createErrorCode(
    100006,
    'Phone number is required',
    HttpStatus.BAD_REQUEST,
  ),
  PASSWORD_IS_REQUIRED: createErrorCode(100007, 'Password is required', HttpStatus.BAD_REQUEST),
};
