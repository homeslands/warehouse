import { HttpStatus } from '@nestjs/common';
import { AuthValidation, TAuthErrorCode } from 'src/auth/auth.validation';
import { RoleValidation, TRoleErrorCode } from 'src/role/role.validation';
import { AuthorityValidation, TAuthorityErrorCode } from 'src/authority/authority.validation';
import {
  AuthorityGroupValidation,
  TAuthorityGroupErrorCode,
} from 'src/authority-group/authority-group.validation';
import { ExampleValidation, TExampleErrorCode } from 'src/example/example.validation';
import { UserValidation, TUserErrorCode } from 'src/user/user.validation';
import { DbValidation, TDbErrorCode } from 'src/db/db.validation';
import { FileValidation, TFileErrorCode } from 'src/file/file.validation';
import {
  NotificationValidation,
  TNotificationErrorCode,
} from 'src/notification/notification.validation';
import { AppCommonValidation, TAppCommonErrorCode } from './app-common.validation';

export interface TErrorCodeValue {
  code: number;
  message: string;
  statusCode: HttpStatus;
}

export function createErrorCode(
  code: number,
  message: string,
  statusCode: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
): TErrorCodeValue {
  return { code, message, statusCode };
}

export const AppValidation: TAuthErrorCode &
  TRoleErrorCode &
  TAuthorityErrorCode &
  TAuthorityGroupErrorCode &
  TExampleErrorCode &
  TUserErrorCode &
  TDbErrorCode &
  TFileErrorCode &
  TNotificationErrorCode &
  TAppCommonErrorCode = {
  ...AuthValidation,
  ...RoleValidation,
  ...AuthorityValidation,
  ...AuthorityGroupValidation,
  ...ExampleValidation,
  ...UserValidation,
  ...DbValidation,
  ...FileValidation,
  ...NotificationValidation,
  ...AppCommonValidation,
};

// Guard chống trùng mã lỗi (code) giữa các module — throw lúc khởi động nếu trùng.
const seenCodes = new Map<number, string>();
for (const [key, value] of Object.entries(AppValidation)) {
  const owner = seenCodes.get(value.code);
  if (owner) {
    throw new Error(
      `Duplicate error code ${value.code} between "${owner}" and "${key}" in AppValidation`,
    );
  }
  seenCodes.set(value.code, key);
}
