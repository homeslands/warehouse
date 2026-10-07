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
export const LOCK_OWN_ACCOUNT_NOT_ALLOWED = 'LOCK_OWN_ACCOUNT_NOT_ALLOWED';
export const USER_IS_WAREHOUSE_MANAGER = 'USER_IS_WAREHOUSE_MANAGER';
export const CHANGE_OWN_ROLE_NOT_ALLOWED = 'CHANGE_OWN_ROLE_NOT_ALLOWED';
export const ADMIN_CANNOT_MANAGE_ADMIN = 'ADMIN_CANNOT_MANAGE_ADMIN';
export const DELETE_OWN_ACCOUNT_NOT_ALLOWED = 'DELETE_OWN_ACCOUNT_NOT_ALLOWED';
export const USER_PHONENUMBER_RESERVED_BY_DELETED_USER =
  'USER_PHONENUMBER_RESERVED_BY_DELETED_USER';

export const USER_START_DATE_INVALID = 'USER_START_DATE_INVALID';
export const USER_END_DATE_INVALID = 'USER_END_DATE_INVALID';
export const USER_DATE_RANGE_INVALID = 'USER_DATE_RANGE_INVALID';
export const USER_BIRTHDAY_INVALID = 'USER_BIRTHDAY_INVALID';
export const USER_SORT_INVALID = 'USER_SORT_INVALID';
export const USER_IS_ACTIVE_INVALID = 'USER_IS_ACTIVE_INVALID';

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
  | typeof CHANGE_OWN_PASSWORD_NOT_ALLOWED
  | typeof LOCK_OWN_ACCOUNT_NOT_ALLOWED
  | typeof USER_IS_WAREHOUSE_MANAGER
  | typeof CHANGE_OWN_ROLE_NOT_ALLOWED
  | typeof ADMIN_CANNOT_MANAGE_ADMIN
  | typeof DELETE_OWN_ACCOUNT_NOT_ALLOWED
  | typeof USER_PHONENUMBER_RESERVED_BY_DELETED_USER
  | typeof USER_START_DATE_INVALID
  | typeof USER_END_DATE_INVALID
  | typeof USER_DATE_RANGE_INVALID
  | typeof USER_BIRTHDAY_INVALID
  | typeof USER_SORT_INVALID
  | typeof USER_IS_ACTIVE_INVALID;

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
  LOCK_OWN_ACCOUNT_NOT_ALLOWED: createErrorCode(
    100414,
    'You cannot lock your own account',
    HttpStatus.BAD_REQUEST,
  ),
  // Khoá/xoá manager là bỏ kho lại không người phụ trách — phải đổi manager kho trước
  // (`PUT /warehouses/{slug}/manager`) rồi mới khoá/xoá được.
  USER_IS_WAREHOUSE_MANAGER: createErrorCode(
    100415,
    'User is the manager of a warehouse — reassign the warehouse manager before locking or deleting',
    HttpStatus.CONFLICT,
  ),
  CHANGE_OWN_ROLE_NOT_ALLOWED: createErrorCode(
    100416,
    'You cannot change your own role',
    HttpStatus.BAD_REQUEST,
  ),
  // ADMIN không được sửa/khoá/đổi role của ADMIN khác — chỉ SUPER_ADMIN mới đụng được tài khoản ADMIN.
  ADMIN_CANNOT_MANAGE_ADMIN: createErrorCode(
    100417,
    'An admin cannot modify or lock another admin account',
    HttpStatus.FORBIDDEN,
  ),
  DELETE_OWN_ACCOUNT_NOT_ALLOWED: createErrorCode(
    100418,
    'You cannot delete your own account',
    HttpStatus.BAD_REQUEST,
  ),
  // UNIQUE index của `phonenumber_column` tính cả user đã xoá mềm (MySQL không có partial index).
  USER_PHONENUMBER_RESERVED_BY_DELETED_USER: createErrorCode(
    100419,
    'Phone number is still held by a deleted user',
  ),
  USER_START_DATE_INVALID: createErrorCode(
    100420,
    'startDate must be a valid date (YYYY-MM-DD or ISO 8601)',
    HttpStatus.BAD_REQUEST,
  ),
  USER_END_DATE_INVALID: createErrorCode(
    100421,
    'endDate must be a valid date (YYYY-MM-DD or ISO 8601)',
    HttpStatus.BAD_REQUEST,
  ),
  USER_DATE_RANGE_INVALID: createErrorCode(
    100422,
    'startDate must not be after endDate',
    HttpStatus.BAD_REQUEST,
  ),
  USER_BIRTHDAY_INVALID: createErrorCode(
    100423,
    'birthday must be a valid date in YYYY-MM-DD format',
    HttpStatus.BAD_REQUEST,
  ),
  USER_SORT_INVALID: createErrorCode(
    100424,
    `sort must be field:ASC|DESC, field one of: createdAt, updatedAt, firstName, lastName, phonenumber, dob`,
    HttpStatus.BAD_REQUEST,
  ),
  USER_IS_ACTIVE_INVALID: createErrorCode(
    100425,
    'isActive must be true or false',
    HttpStatus.BAD_REQUEST,
  ),
};
