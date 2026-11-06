import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Inject,
  LoggerService,
  Optional,
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { Response } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { isMappedGrpcStatus } from 'src/shared/grpc/grpc-http-status';
import { StorageRpcError } from './storage-rpc.error';
import { translateStorageRpcError } from './storage-rpc-error.translator';

/**
 * Trả lỗi RPC Storage cho client dưới dạng envelope lỗi `/api/v1`. Gắn ở controller v1
 * (`@UseFilters(StorageRpcErrorFilter)`); route legacy không dùng filter này.
 *
 * Log (nếu có logger): chỉ rpc, tên gRPC status, HTTP status, traceId — không log `details` của Storage,
 * metadata hay `authorization`. Log 5xx và status ngoài bảng R2 (DEV-197-01) ở mức warn.
 */
@Catch(StorageRpcError)
export class StorageRpcErrorFilter implements ExceptionFilter<StorageRpcError> {
  constructor(
    @Optional()
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger?: LoggerService,
  ) {}

  catch(exception: StorageRpcError, host: ArgumentsHost): void {
    const { statusCode, body } = translateStorageRpcError(exception);
    this.logIfServerSide(exception, statusCode);
    host.switchToHttp().getResponse<Response>().status(statusCode).json(body);
  }

  private logIfServerSide(exception: StorageRpcError, statusCode: HttpStatus): void {
    const unmapped = !isMappedGrpcStatus(exception.grpcCode);
    if (!this.logger || (statusCode < HttpStatus.INTERNAL_SERVER_ERROR && !unmapped)) return;
    this.logger.warn(
      `Storage RPC ${exception.rpc} failed: grpc=${GrpcStatus[exception.grpcCode]} http=${statusCode}` +
        ` traceId=${exception.traceId}${unmapped ? ' (status not in R2 table, DEV-197-01)' : ''}`,
      `${StorageRpcErrorFilter.name}.${this.catch.name}`,
    );
  }
}
