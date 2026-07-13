import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const USER_PHONENUMBER_DOES_EXIST = 'USER_PHONENUMBER_DOES_EXIST';
export const USER_PHONENUMBER_IS_REQUIRED = 'USER_PHONENUMBER_IS_REQUIRED';
export const USER_PASSWORD_IS_REQUIRED = 'USER_PASSWORD_IS_REQUIRED';
export const USER_ROLE_SLUG_IS_REQUIRED = 'USER_ROLE_SLUG_IS_REQUIRED';

export type TUserErrorCodeKey =
  | typeof USER_PHONENUMBER_DOES_EXIST
  | typeof USER_PHONENUMBER_IS_REQUIRED
  | typeof USER_PASSWORD_IS_REQUIRED
  | typeof USER_ROLE_SLUG_IS_REQUIRED;

export type TUserErrorCode = Record<TUserErrorCodeKey, TErrorCodeValue>;

export const UserValidation: TUserErrorCode = {
  USER_PHONENUMBER_DOES_EXIST: createErrorCode(100401, 'Phone number already exists'),
  USER_PHONENUMBER_IS_REQUIRED: createErrorCode(
    100402,
    'Phone number is required',
    HttpStatus.BAD_REQUEST,
  ),
  USER_PASSWORD_IS_REQUIRED: createErrorCode(
    100403,
    'Password is required',
    HttpStatus.BAD_REQUEST,
  ),
  USER_ROLE_SLUG_IS_REQUIRED: createErrorCode(
    100404,
    'Role slug is required',
    HttpStatus.BAD_REQUEST,
  ),
};
