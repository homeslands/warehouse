import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Request, Response } from 'express';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { AppCommonValidation } from './app-common.validation';

// Bắt lỗi xung đột version (optimistic locking) từ TypeORM ở tầng global,
// để các service dùng `lock: { mode: 'optimistic', version }` không phải tự try/catch.
@Catch(OptimisticLockVersionMismatchError)
export class OptimisticLockExceptionFilter implements ExceptionFilter {
  catch(_exception: OptimisticLockVersionMismatchError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { code, message, statusCode } = AppCommonValidation.DATA_VERSION_CONFLICT;

    response.status(statusCode).json({
      statusCode,
      code,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    });
  }
}
