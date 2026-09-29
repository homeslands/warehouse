import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const USER_PHONENUMBER_DOES_EXIST = 'USER_PHONENUMBER_DOES_EXIST';
export const USER_PHONENUMBER_IS_REQUIRED = 'USER_PHONENUMBER_IS_REQUIRED';
export const USER_PHONENUMBER_INVALID = 'USER_PHONENUMBER_INVALID';
export const USER_PASSWORD_IS_REQUIRED = 'USER_PASSWORD_IS_REQUIRED';
export const USER_ROLE_SLUG_IS_REQUIRED = 'USER_ROLE_SLUG_IS_REQUIRED';
export const USER_FIRST_NAME_IS_REQUIRED = 'USER_FIRST_NAME_IS_REQUIRED';
export const USER_LAST_NAME_IS_REQUIRED = 'USER_LAST_NAME_IS_REQUIRED';
export const USER_DOB_INVALID = 'USER_DOB_INVALID';
export const USER_EMAIL_INVALID = 'USER_EMAIL_INVALID';
export const USER_NOT_FOUND = 'USER_NOT_FOUND';
export const USER_NEW_PASSWORD_IS_REQUIRED = 'USER_NEW_PASSWORD_IS_REQUIRED';
export const CHANGE_PASSWORD_FORBIDDEN = 'CHANGE_PASSWORD_FORBIDDEN';
export const CHANGE_OWN_PASSWORD_NOT_ALLOWED = 'CHANGE_OWN_PASSWORD_NOT_ALLOWED';

export type TUserErrorCodeKey =
  | typeof USER_PHONENUMBER_DOES_EXIST
  | typeof USER_PHONENUMBER_IS_REQUIRED
  | typeof USER_PHONENUMBER_INVALID
  | typeof USER_PASSWORD_IS_REQUIRED
  | typeof USER_ROLE_SLUG_IS_REQUIRED
  | typeof USER_FIRST_NAME_IS_REQUIRED
  | typeof USER_LAST_NAME_IS_REQUIRED
  | typeof USER_DOB_INVALID
  | typeof USER_EMAIL_INVALID
  | typeof USER_NOT_FOUND
  | typeof USER_NEW_PASSWORD_IS_REQUIRED
  | typeof CHANGE_PASSWORD_FORBIDDEN
  | typeof CHANGE_OWN_PASSWORD_NOT_ALLOWED;

export type TUserErrorCode = Record<TUserErrorCodeKey, TErrorCodeValue>;

export const UserValidation: TUserErrorCode = {
  USER_PHONENUMBER_DOES_EXIST: createErrorCode(100401, 'Phone number already exists'),
  USER_PHONENUMBER_IS_REQUIRED: createErrorCode(
    100402,
    'Phone number is required',
    HttpStatus.BAD_REQUEST,
  ),
  USER_PHONENUMBER_INVALID: createErrorCode(
    100409,
    'Phone number must be a valid Vietnamese mobile number (e.g. 0900000000)',
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
  USER_FIRST_NAME_IS_REQUIRED: createErrorCode(
    100410,
    'First name is required',
    HttpStatus.BAD_REQUEST,
  ),
  USER_LAST_NAME_IS_REQUIRED: createErrorCode(
    100411,
    'Last name is required',
    HttpStatus.BAD_REQUEST,
  ),
  USER_DOB_INVALID: createErrorCode(
    100412,
    'Date of birth must be a valid date in YYYY-MM-DD format',
    HttpStatus.BAD_REQUEST,
  ),
  USER_EMAIL_INVALID: createErrorCode(100413, 'Email is invalid', HttpStatus.BAD_REQUEST),
  USER_NOT_FOUND: createErrorCode(100405, 'User not found', HttpStatus.NOT_FOUND),
  USER_NEW_PASSWORD_IS_REQUIRED: createErrorCode(
    100406,
    'New password is required',
    HttpStatus.BAD_REQUEST,
  ),
  CHANGE_PASSWORD_FORBIDDEN: createErrorCode(
    100407,
    'You are not allowed to change the password of this user',
    HttpStatus.FORBIDDEN,
  ),
  // `POST /users/{userSlug}/change-password` cố ý không cho tự trỏ vào chính mình: endpoint đó
  // không hỏi mật khẩu hiện tại, nếu cho phép thì bất kỳ ai cầm access token bị đánh cắp của một
  // admin đều đổi được mật khẩu của chính tài khoản đó mà không cần biết mật khẩu cũ.
  CHANGE_OWN_PASSWORD_NOT_ALLOWED: createErrorCode(
    100408,
    'Use POST /auth/change-password to change your own password',
    HttpStatus.BAD_REQUEST,
  ),
};
