import { HttpStatus } from '@nestjs/common';

/**
 * Kiểu + factory mã lỗi, tách khỏi `app.validation.ts` (issue #179): `app.validation.ts` gộp
 * `<Module>Validation` của mọi module, nên nếu các file đó import ngược `createErrorCode` từ
 * `app.validation.ts` sẽ thành vòng import — file nào được nạp trước thì thấy `createErrorCode`
 * hoặc `AppValidation` còn `undefined`. File này KHÔNG được import `*.validation.ts` nào.
 */
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
