import { HttpException, HttpStatus } from '@nestjs/common';
import { TErrorCodeValue } from './app.validation';

export class AppException extends HttpException {
  public readonly code?: number;

  constructor(errorCodeValue: TErrorCodeValue | HttpStatus, message?: string, statusCode?: number) {
    if (typeof errorCodeValue === 'object') {
      super(message ?? errorCodeValue.message, statusCode ?? errorCodeValue.statusCode);
      this.code = errorCodeValue.code;
    } else {
      super(message ?? 'Internal server error', statusCode ?? errorCodeValue);
    }
  }
}
