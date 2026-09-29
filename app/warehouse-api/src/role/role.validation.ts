import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const ROLE_NOT_FOUND = 'ROLE_NOT_FOUND';
export const ROLE_NAME_ALREADY_EXISTS = 'ROLE_NAME_ALREADY_EXISTS';
export const ROLE_NAME_IS_REQUIRED = 'ROLE_NAME_IS_REQUIRED';
export const ROLE_LEVEL_FORBIDDEN = 'ROLE_LEVEL_FORBIDDEN';
export const ROLE_BUILT_IN_CANNOT_BE_DELETED = 'ROLE_BUILT_IN_CANNOT_BE_DELETED';
export const ROLE_IN_USE = 'ROLE_IN_USE';

export type TRoleErrorCodeKey =
  | typeof ROLE_NOT_FOUND
  | typeof ROLE_NAME_ALREADY_EXISTS
  | typeof ROLE_NAME_IS_REQUIRED
  | typeof ROLE_LEVEL_FORBIDDEN
  | typeof ROLE_BUILT_IN_CANNOT_BE_DELETED
  | typeof ROLE_IN_USE;

export type TRoleErrorCode = Record<TRoleErrorCodeKey, TErrorCodeValue>;

export const RoleValidation: TRoleErrorCode = {
  ROLE_NOT_FOUND: createErrorCode(100101, 'Role not found'),
  ROLE_NAME_ALREADY_EXISTS: createErrorCode(100102, 'Role name already exists'),
  ROLE_NAME_IS_REQUIRED: createErrorCode(100103, 'Role name is required', HttpStatus.BAD_REQUEST),
  ROLE_LEVEL_FORBIDDEN: createErrorCode(
    100104,
    'Cannot manage a role of equal or higher level',
    HttpStatus.FORBIDDEN,
  ),
  ROLE_BUILT_IN_CANNOT_BE_DELETED: createErrorCode(100105, 'Built-in role cannot be deleted'),
  ROLE_IN_USE: createErrorCode(100106, 'Role is still assigned to users'),
};
