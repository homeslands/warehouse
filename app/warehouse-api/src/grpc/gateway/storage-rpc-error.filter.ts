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
import {
  TranslatedStorageRpcError,
  translateStorageRpcError,
} from './storage-rpc-error.translator';
import { STORAGE_CALLER_IDENTITY_REJECTED } from './storage-rpc.validation';

/**
 * Trả lỗi RPC Storage cho client dưới dạng envelope lỗi `/api/v1`. Gắn ở controller v1
 * (`@UseFilters(StorageRpcErrorFilter)`); route legacy không dùng filter này.
 *
 * Log (nếu có logger): chỉ rpc, tên gRPC status, HTTP status, traceId — không log `details` của Storage,
 * metadata hay `authorization`. Identity service bị từ chối ⇒ error; 5xx và status ngoài bảng R2
 * (DEV-197-01) ⇒ warn.
 */
@Catch(StorageRpcError)
export class StorageRpcErrorFilter implements ExceptionFilter<StorageRpcError> {
  constructor(
    @Optional()
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger?: LoggerService,
  ) {}

  catch(exception: StorageRpcError, host: ArgumentsHost): void {
    const translated = translateStorageRpcError(exception);
    this.log(exception, translated);
    host.switchToHttp().getResponse<Response>().status(translated.statusCode).json(translated.body);
  }

  /** Không log `GATEWAY_AUTHORIZATION_MALFORMED`: lỗi input dự kiến của client (ERR-02 (a)). */
  private log(exception: StorageRpcError, translated: TranslatedStorageRpcError): void {
    if (!this.logger) return;
    const context = `${StorageRpcErrorFilter.name}.${this.catch.name}`;
    const line =
      `Storage RPC ${exception.rpc} failed: grpc=${GrpcStatus[exception.grpcCode]}` +
      ` http=${translated.statusCode} traceId=${exception.traceId}`;
    if (translated.special === STORAGE_CALLER_IDENTITY_REJECTED) {
      // Sự cố cấu hình cert/allowlist giữa service: mọi request đều hỏng ⇒ mức error để cảnh báo vận hành.
      this.logger.error(
        `${line} (Storage rejected the Gateway service identity)`,
        undefined,
        context,
      );
      return;
    }
    if (translated.special) return;
    const unmapped = !isMappedGrpcStatus(exception.grpcCode);
    if (translated.statusCode < HttpStatus.INTERNAL_SERVER_ERROR && !unmapped) return;
    this.logger.warn(`${line}${unmapped ? ' (status not in R2 table, DEV-197-01)' : ''}`, context);
  }
}
