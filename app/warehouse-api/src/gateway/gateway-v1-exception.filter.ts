import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { Request, Response } from 'express';
import { StorageRpcError } from 'src/grpc/gateway/storage-rpc.error';
import { translateStorageRpcError } from 'src/grpc/gateway/storage-rpc-error.translator';
import { STORAGE_CALLER_IDENTITY_REJECTED } from 'src/grpc/gateway/storage-rpc.validation';
import { SessionException } from 'src/session/session.exception';
import { v1Error, V1ErrorEnvelope, V1FieldError } from 'src/shared/api-v1/envelope';
import { GatewayException } from './gateway.exception';
import { requestContext } from './gateway-request';
import { GatewayErrorCodeValue, GatewayValidation } from './gateway.validation';

interface ErrorSource {
  statusCode: number;
  code: number;
  errorKey: string;
  message: string;
  errors?: V1FieldError[];
}

/**
 * Filter lỗi DUY NHẤT của Gateway v1 (`@Catch()` mọi lỗi), để không request nào lọt ra ngoài envelope lỗi
 * OpenAPI R2 (statusCode/code/errorKey/message/traceId/timestamp):
 * - `GatewayException` (biên Gateway), `SessionException` (Gateway kiểm JWT trước RPC) ⇒ mã của chúng;
 * - `StorageRpcError` ⇒ translator I-01b (gRPC status → HTTP, detail đã validate);
 * - `HttpException` của Nest/Express: 404 route lạ ⇒ 404; 4xx khác (JSON hỏng, body quá lớn) ⇒ 400;
 * - còn lại (RangeError, `StorageEnumMappingError`, bug — follow-up I-01b) ⇒ 500 message cố định.
 * Log chỉ tên lỗi/rpc/status/traceId; không log body, header, token, message lỗi nội bộ.
 */
@Catch()
export class GatewayV1ExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const { traceId } = requestContext(http.getRequest<Request>());
    const body = this.toEnvelope(exception, traceId);
    http.getResponse<Response>().status(body.statusCode).json(body);
  }

  private toEnvelope(exception: unknown, traceId: string): V1ErrorEnvelope {
    if (exception instanceof StorageRpcError) return this.fromStorage(exception);
    return v1Error({ ...this.source(exception, traceId), traceId });
  }

  private fromStorage(exception: StorageRpcError): V1ErrorEnvelope {
    const translated = translateStorageRpcError(exception);
    const line = `Storage RPC ${exception.rpc} failed: grpc=${GrpcStatus[exception.grpcCode]} http=${translated.statusCode} traceId=${exception.traceId}`;
    if (translated.special === STORAGE_CALLER_IDENTITY_REJECTED)
      this.logger.error(`${line} (Storage rejected the Gateway service identity)`);
    else if (translated.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) this.logger.warn(line);
    return translated.body;
  }

  private source(exception: unknown, traceId: string): ErrorSource {
    if (exception instanceof GatewayException || exception instanceof SessionException)
      return {
        ...pick(exception.error),
        errors: [...exception.fieldErrors],
      };
    if (exception instanceof HttpException) return pick(httpErrorCode(exception.getStatus()));
    const name = exception instanceof Error ? exception.name : typeof exception;
    this.logger.error(`Gateway v1 request failed (traceId=${traceId}): ${name}`);
    return pick(GatewayValidation.GATEWAY_INTERNAL);
  }
}

function pick(value: Omit<GatewayErrorCodeValue, 'errorKey'> & { errorKey: string }): ErrorSource {
  return {
    statusCode: value.statusCode,
    code: value.code,
    errorKey: value.errorKey,
    message: value.message,
  };
}

function httpErrorCode(status: number): GatewayErrorCodeValue {
  if (status === HttpStatus.NOT_FOUND) return GatewayValidation.GATEWAY_ROUTE_NOT_FOUND;
  if (status >= HttpStatus.BAD_REQUEST && status < HttpStatus.INTERNAL_SERVER_ERROR)
    return GatewayValidation.GATEWAY_PAYLOAD_INVALID;
  return GatewayValidation.GATEWAY_INTERNAL;
}
