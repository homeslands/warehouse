import { HttpStatus } from '@nestjs/common';
import { AuthValidation, TAuthErrorCode } from 'src/auth/auth.validation';
import { RoleValidation, TRoleErrorCode } from 'src/role/role.validation';
import { ExampleValidation, TExampleErrorCode } from 'src/example/example.validation';
import { DbValidation, TDbErrorCode } from 'src/db/db.validation';

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

export const AppValidation: TAuthErrorCode & TRoleErrorCode & TExampleErrorCode & TDbErrorCode = {
  ...AuthValidation,
  ...RoleValidation,
  ...ExampleValidation,
  ...DbValidation,
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
