import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppValidation } from './app.validation';
import { AppException } from './app.exception';

/**
 * `ValidationPipe` gắn tiền tố đường dẫn vào message của DTO lồng nhau (`@ValidateNested`):
 * `items.0.IMPORT_FORM_ITEM_QUANTITY_INVALID`. Thử key nguyên văn trước, rồi tới đoạn sau dấu `.`
 * cuối cùng — key trong `AppValidation` không chứa dấu chấm.
 */
const toValidationKey = (message: string): string | undefined => {
  if (AppValidation[message]) return message;
  const lastSegment = message.slice(message.lastIndexOf('.') + 1);
  return AppValidation[lastSegment] ? lastSegment : undefined;
};

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
      const validationKey = firstMessage && toValidationKey(firstMessage);

      if (validationKey) {
        const mapped = AppValidation[validationKey];
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
