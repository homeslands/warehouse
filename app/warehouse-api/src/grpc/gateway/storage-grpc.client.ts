import {
  ChannelCredentials,
  Client,
  Metadata,
  ServiceDefinition,
  ServiceError,
} from '@grpc/grpc-js';
import { OnModuleDestroy } from '@nestjs/common';
import { isValidTraceId } from 'src/shared/api-v1/trace-id';
import { getStorageServiceDefinition } from '../storage-proto.runtime';
import {
  AUTHORIZATION_METADATA_KEY,
  GRPC_DEFAULT_AUTHORITY,
  GRPC_SSL_TARGET_NAME_OVERRIDE,
  TRACE_ID_METADATA_KEY,
} from '../grpc.constants';
import { createGatewayChannelCredentials, MtlsMaterial } from '../mtls/mtls-credentials';
import { StorageRpcError } from './storage-rpc.error';

export interface StorageGrpcClientConfig {
  /** `host:port` của Storage. */
  address: string;
  /** Tên TLS (SAN DNS) phải có trong cert Storage; kiểm cả khi `address` là IP. */
  serverName: string;
  tls: MtlsMaterial;
  /** Deadline mặc định cho mỗi RPC (ms, số nguyên dương). */
  deadlineMs: number;
}

/**
 * Ngữ cảnh caller cho 1 RPC. Chỉ có 3 thứ này đi vào metadata — identity không bao giờ lấy từ body,
 * và Gateway không chuyển tiếp header HTTP nào khác.
 */
export interface StorageRpcCallContext {
  /** UUID đã qua `normalizeTraceId`. */
  traceId: string;
  /** Header HTTP `Authorization` nguyên văn (JWT gốc). Bỏ trống cho login/refresh (chưa có JWT). */
  authorization?: string;
  /** Ghi đè deadline mặc định cho RPC này (ms). */
  deadlineMs?: number;
}

const assertPositiveInteger = (name: string, value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive integer (ms)`);
};

/**
 * Client gRPC Gateway → Storage qua mTLS. Mỗi RPC mang metadata `authorization` (JWT gốc, nếu có) +
 * `x-trace-id`, và deadline. Lỗi gRPC ⇒ `StorageRpcError` (dịch sang HTTP bởi `StorageRpcErrorFilter`).
 * I-01b chỉ hỗ trợ unary; client-stream `UploadFile` làm ở I-04.
 */
export class StorageGrpcClient implements OnModuleDestroy {
  private readonly client: Client;
  private readonly service: ServiceDefinition;

  constructor(
    private readonly config: StorageGrpcClientConfig,
    channelCredentials: ChannelCredentials = createGatewayChannelCredentials(config.tls),
  ) {
    assertPositiveInteger('deadlineMs', config.deadlineMs);
    if (!config.serverName) throw new RangeError('serverName is required');
    this.service = getStorageServiceDefinition();
    this.client = new Client(config.address, channelCredentials, {
      [GRPC_SSL_TARGET_NAME_OVERRIDE]: config.serverName,
      [GRPC_DEFAULT_AUTHORITY]: config.serverName,
    });
  }

  /** Metadata gửi Storage: chỉ `x-trace-id` và (nếu có) `authorization` nguyên văn. */
  static buildMetadata(context: StorageRpcCallContext): Metadata {
    if (!isValidTraceId(context.traceId))
      throw new RangeError('traceId must be a UUID from normalizeTraceId');
    const metadata = new Metadata();
    metadata.set(TRACE_ID_METADATA_KEY, context.traceId);
    if (context.authorization !== undefined) {
      if (typeof context.authorization !== 'string' || !context.authorization)
        throw new RangeError('authorization must be a non-empty string when provided');
      metadata.set(AUTHORIZATION_METADATA_KEY, context.authorization);
    }
    return metadata;
  }

  unary<TResponse extends object = Record<string, unknown>>(
    rpc: string,
    request: object,
    context: StorageRpcCallContext,
  ): Promise<TResponse> {
    const method = this.service[rpc];
    if (!method) throw new RangeError(`unknown Storage RPC ${rpc}`);
    if (method.requestStream || method.responseStream)
      throw new RangeError(`Storage RPC ${rpc} is a stream; use a stream call`);
    const deadlineMs = context.deadlineMs ?? this.config.deadlineMs;
    assertPositiveInteger('deadlineMs', deadlineMs);
    const metadata = StorageGrpcClient.buildMetadata(context);

    return new Promise<TResponse>((resolve, reject) => {
      this.client.makeUnaryRequest<object, TResponse>(
        method.path,
        method.requestSerialize,
        method.responseDeserialize,
        request,
        metadata,
        { deadline: Date.now() + deadlineMs },
        (error: ServiceError | null, response?: TResponse) => {
          if (error) {
            reject(
              new StorageRpcError(
                rpc,
                error.code,
                context.traceId,
                error.metadata ?? new Metadata(),
              ),
            );
            return;
          }
          resolve(response);
        },
      );
    });
  }

  close(): void {
    this.client.close();
  }

  onModuleDestroy(): void {
    this.close();
  }
}
