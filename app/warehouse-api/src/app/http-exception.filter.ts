import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppValidation } from './app.validation';
import { AppException } from './app.exception';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = exception.getStatus();
    let code: number | undefined = exception instanceof AppException ? exception.code : undefined;
    let message: string = exception.message;

    const exceptionResponse = exception.getResponse();
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const rawMessage = (exceptionResponse as { message?: string | string[] }).message;
      const firstMessage = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;

      if (firstMessage && AppValidation[firstMessage]) {
        const mapped = AppValidation[firstMessage];
        statusCode = mapped.statusCode ?? HttpStatus.UNPROCESSABLE_ENTITY;
        code = mapped.code;
        message = mapped.message;
      } else if (firstMessage) {
        message = firstMessage;
      }
    }

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
