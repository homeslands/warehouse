import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const ROLE_NOT_FOUND = 'ROLE_NOT_FOUND';
export const ROLE_NAME_ALREADY_EXISTS = 'ROLE_NAME_ALREADY_EXISTS';
export const ROLE_NAME_IS_REQUIRED = 'ROLE_NAME_IS_REQUIRED';

export type TRoleErrorCodeKey =
  typeof ROLE_NOT_FOUND | typeof ROLE_NAME_ALREADY_EXISTS | typeof ROLE_NAME_IS_REQUIRED;

export type TRoleErrorCode = Record<TRoleErrorCodeKey, TErrorCodeValue>;

export const RoleValidation: TRoleErrorCode = {
  ROLE_NOT_FOUND: createErrorCode(100101, 'Role not found'),
  ROLE_NAME_ALREADY_EXISTS: createErrorCode(100102, 'Role name already exists'),
  ROLE_NAME_IS_REQUIRED: createErrorCode(100103, 'Role name is required', HttpStatus.BAD_REQUEST),
};
