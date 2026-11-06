import {
  ChannelCredentials,
  Client,
  Metadata,
  ServiceDefinition,
  ServiceError,
  status as GrpcStatus,
} from '@grpc/grpc-js';
import { OnModuleDestroy } from '@nestjs/common';
import { isValidTraceId } from 'src/shared/api-v1/trace-id';
import { getStorageServiceDefinition } from '../storage-proto.runtime';
import {
  AUTHORIZATION_METADATA_KEY,
  GRPC_DEFAULT_AUTHORITY,
  GRPC_SSL_TARGET_NAME_OVERRIDE,
  STORAGE_GRPC_MAX_DEADLINE_MS,
  STORAGE_GRPC_MIN_DEADLINE_MS,
  TRACE_ID_METADATA_KEY,
} from '../grpc.constants';
import { createGatewayChannelCredentials, MtlsMaterial } from '../mtls/mtls-credentials';
import { StorageRpcError } from './storage-rpc.error';
import { GATEWAY_AUTHORIZATION_MALFORMED } from './storage-rpc.validation';

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

/** Deadline (ms) là số nguyên trong [MIN, MAX] — xem `STORAGE_GRPC_MAX_DEADLINE_MS`. */
export function assertStorageDeadlineMs(value: unknown): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < STORAGE_GRPC_MIN_DEADLINE_MS ||
    value > STORAGE_GRPC_MAX_DEADLINE_MS
  )
    throw new RangeError(
      `deadlineMs must be an integer in [${STORAGE_GRPC_MIN_DEADLINE_MS}, ${STORAGE_GRPC_MAX_DEADLINE_MS}] ms`,
    );
}

/**
 * Quy tắc giá trị metadata ASCII của grpc-js (`Metadata.set` cho key không đuôi `-bin`): chỉ `[ -~]`.
 * Vi phạm thì grpc-js ném Error có CHÉP NGUYÊN giá trị vào message (review I-01b M1: JWT vào log) ⇒
 * phải kiểm trước khi gọi `Metadata.set`, và lỗi của mình không bao giờ chứa giá trị.
 */
const GRPC_ASCII_METADATA_VALUE = /^[ -~]*$/;
/** `Authorization`: các token ASCII in được, cách nhau đúng 1 dấu cách (không TAB/CR/LF/non-ASCII). */
const AUTHORIZATION_VALUE = /^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/;

export function isForwardableAuthorization(value: unknown): value is string {
  return typeof value === 'string' && AUTHORIZATION_VALUE.test(value);
}

function setAsciiMetadata(metadata: Metadata, key: string, value: string): void {
  if (!GRPC_ASCII_METADATA_VALUE.test(value))
    throw new RangeError(`metadata ${key} contains characters not allowed by gRPC`);
  metadata.set(key, value);
}

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
    assertStorageDeadlineMs(config.deadlineMs);
    if (!config.serverName) throw new RangeError('serverName is required');
    this.service = getStorageServiceDefinition();
    this.client = new Client(config.address, channelCredentials, {
      [GRPC_SSL_TARGET_NAME_OVERRIDE]: config.serverName,
      [GRPC_DEFAULT_AUTHORITY]: config.serverName,
    });
  }

  /**
   * Metadata gửi Storage: chỉ `x-trace-id` và (nếu có) `authorization` nguyên văn. Mọi giá trị qua
   * `setAsciiMetadata`; lỗi có message cố định, không chứa giá trị.
   */
  static buildMetadata(context: StorageRpcCallContext): Metadata {
    if (!isValidTraceId(context.traceId))
      throw new RangeError('traceId must be a UUID from normalizeTraceId');
    const metadata = new Metadata();
    setAsciiMetadata(metadata, TRACE_ID_METADATA_KEY, context.traceId);
    if (context.authorization !== undefined) {
      if (!isForwardableAuthorization(context.authorization))
        throw new RangeError('authorization header is malformed');
      setAsciiMetadata(metadata, AUTHORIZATION_METADATA_KEY, context.authorization);
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
    assertStorageDeadlineMs(deadlineMs);
    // Header Authorization sai định dạng là lỗi input của client ⇒ 401 qua filter, RPC không được gửi.
    if (context.authorization !== undefined && !isForwardableAuthorization(context.authorization))
      return Promise.reject(
        new StorageRpcError(
          rpc,
          GrpcStatus.UNAUTHENTICATED,
          context.traceId,
          new Metadata(),
          GATEWAY_AUTHORIZATION_MALFORMED,
        ),
      );
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
