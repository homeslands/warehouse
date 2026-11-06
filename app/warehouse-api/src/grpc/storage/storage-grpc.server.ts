import {
  Deadline,
  Metadata,
  Server,
  ServerErrorResponse,
  ServerInterceptingCall,
  ServerInterceptingCallInterface,
  ServerInterceptor,
  ServiceDefinition,
  status as GrpcStatus,
  UntypedServiceImplementation,
} from '@grpc/grpc-js';
import { normalizeTraceId } from 'src/shared/api-v1/trace-id';
import {
  encodeStorageErrorDetail,
  STORAGE_ERROR_DETAIL_METADATA_KEY,
  StorageErrorDetail,
} from 'src/shared/grpc/storage-error-detail';
import {
  CALLER_IDENTITY_REJECTED_CODE,
  CALLER_IDENTITY_REJECTED_ERROR_KEY,
} from 'src/shared/grpc/service-identity';
import { getStorageServiceDefinition } from '../storage-proto.runtime';
import {
  AUTHORIZATION_METADATA_KEY,
  GRPC_SERVER_SHUTDOWN_GRACE_MS,
  TRACE_ID_METADATA_KEY,
} from '../grpc.constants';
import {
  createStorageServerCredentials,
  MtlsMaterial,
  peerIdentity,
} from '../mtls/mtls-credentials';

/** Detail marker đính khi từ chối caller (dựng 1 lần, đã validate bởi encoder). */
const CALLER_IDENTITY_REJECTED_DETAIL = encodeStorageErrorDetail({
  code: CALLER_IDENTITY_REJECTED_CODE,
  errorKey: CALLER_IDENTITY_REJECTED_ERROR_KEY,
  errors: [],
});

/**
 * Bootstrap server gRPC của Storage (W02 I-01b). Chưa có composition root riêng: hàm này là điểm khởi
 * động để composition root Storage (I-02+) gọi, và để test loopback.
 *
 * - Chỉ nhận kết nối mTLS: client phải trình cert do CA chung cấp (TLS handshake).
 * - Thêm allowlist identity (CN cert): cert hợp lệ nhưng không phải Gateway ⇒ PERMISSION_DENIED,
 *   không có identity ⇒ UNAUTHENTICATED, kèm marker `STORAGE_CALLER_IDENTITY_REJECTED` (Gateway ⇒ 503).
 *   Handler không chạy, nên không truy cập DB (TC-ARC-01).
 * - RPC chưa có handler ⇒ grpc-js trả UNIMPLEMENTED. I-01b không tự viết handler nghiệp vụ.
 */
export interface StorageGrpcServerConfig {
  /** `host:port`; port `0` để hệ điều hành chọn (test). */
  bindAddress: string;
  tls: MtlsMaterial;
  /** CN của cert client được phép gọi (Gateway identity). Không được rỗng. */
  allowedCallerIdentities: readonly string[];
}

export interface RunningStorageGrpcServer {
  server: Server;
  port: number;
  shutdown(): Promise<void>;
}

/**
 * Từ chối caller: giữ status gRPC UNAUTHENTICATED/PERMISSION_DENIED (TC-ARC-01) và đính marker
 * `STORAGE_CALLER_IDENTITY_REJECTED` để Gateway không trả 401/403 cho end-user (review I-01b L1).
 */
function rejectCall(call: ServerInterceptingCallInterface, code: GrpcStatus, details: string) {
  const metadata = new Metadata();
  metadata.set(STORAGE_ERROR_DETAIL_METADATA_KEY, CALLER_IDENTITY_REJECTED_DETAIL);
  call.sendStatus({ code, details, metadata });
}

/** Chặn mọi RPC từ caller không thuộc allowlist, trước khi handler nhận metadata/message. */
export function createCallerAllowlistInterceptor(
  allowedIdentities: ReadonlySet<string>,
): ServerInterceptor {
  return (_methodDescriptor, call) =>
    new ServerInterceptingCall(call, {
      start: (next) => {
        next({
          onReceiveMetadata: (metadata, nextMetadata) => {
            const identity = peerIdentity(call.getAuthContext());
            if (identity === undefined) {
              rejectCall(call, GrpcStatus.UNAUTHENTICATED, 'Service identity is required');
              return;
            }
            if (!allowedIdentities.has(identity)) {
              rejectCall(call, GrpcStatus.PERMISSION_DENIED, 'Caller is not allowed');
              return;
            }
            nextMetadata(metadata);
          },
        });
      },
    });
}

function assertKnownHandlers(
  definition: ServiceDefinition,
  handlers: UntypedServiceImplementation,
) {
  const unknown = Object.keys(handlers).filter((name) => !(name in definition));
  if (unknown.length) throw new RangeError(`unknown Storage RPC handler(s): ${unknown.join(', ')}`);
}

function bind(server: Server, config: StorageGrpcServerConfig): Promise<number> {
  return new Promise((resolve, reject) => {
    server.bindAsync(
      config.bindAddress,
      createStorageServerCredentials(config.tls),
      (error, port) => (error ? reject(error) : resolve(port)),
    );
  });
}

function shutdownServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    // Đóng êm; quá hạn thì buộc huỷ call còn treo để tiến trình dừng được.
    const timer = setTimeout(() => server.forceShutdown(), GRPC_SERVER_SHUTDOWN_GRACE_MS);
    server.tryShutdown(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function startStorageGrpcServer(
  config: StorageGrpcServerConfig,
  handlers: UntypedServiceImplementation = {},
): Promise<RunningStorageGrpcServer> {
  if (!config.allowedCallerIdentities.length)
    throw new RangeError('allowedCallerIdentities must not be empty');
  const definition = getStorageServiceDefinition();
  assertKnownHandlers(definition, handlers);

  const server = new Server({
    interceptors: [createCallerAllowlistInterceptor(new Set(config.allowedCallerIdentities))],
  });
  server.addService(definition, handlers);
  const port = await bind(server, config);
  return { server, port, shutdown: () => shutdownServer(server) };
}

/** Ngữ cảnh một RPC phía Storage, đọc từ metadata do Gateway gửi. */
export interface StorageCallContext {
  /** Giá trị `authorization` nguyên văn (JWT gốc). Storage phải tự kiểm (I-02); ở đây chưa kiểm. */
  authorization?: string;
  traceId: string;
  /** Deadline client đặt (epoch ms); `Infinity` nếu client không đặt. */
  deadlineAt: number;
}

const toEpochMs = (deadline: Deadline): number =>
  deadline instanceof Date ? deadline.getTime() : deadline;

function singleStringValue(metadata: Metadata, key: string): string | undefined {
  const values = metadata.get(key);
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : undefined;
}

/**
 * Chỉ đọc `authorization` và `x-trace-id`; mọi metadata khác (vd header role/user tự đặt) bị bỏ qua —
 * Storage không lấy identity từ metadata/body tự khai. `authorization` lặp nhiều lần ⇒ coi như không có.
 * traceId không phải UUID ⇒ thay UUID mới (như Gateway).
 */
export function readStorageCallContext(call: {
  metadata: Metadata;
  getDeadline(): Deadline;
}): StorageCallContext {
  const context: StorageCallContext = {
    traceId: normalizeTraceId(singleStringValue(call.metadata, TRACE_ID_METADATA_KEY)),
    deadlineAt: toEpochMs(call.getDeadline()),
  };
  const authorization = singleStringValue(call.metadata, AUTHORIZATION_METADATA_KEY);
  if (authorization) context.authorization = authorization;
  return context;
}

/**
 * Lỗi RPC phía Storage có detail nghiệp vụ đã validate trong trailing metadata `warehouse-error-bin`.
 * `details` (message gRPC) chỉ để chẩn đoán nội bộ; Gateway không trả nó cho client.
 */
export function storageRpcFailure(
  code: GrpcStatus,
  detail?: StorageErrorDetail,
  details = GrpcStatus[code],
): ServerErrorResponse {
  const metadata = new Metadata();
  if (detail) metadata.set(STORAGE_ERROR_DETAIL_METADATA_KEY, encodeStorageErrorDetail(detail));
  return Object.assign(new Error(details), { code, details, metadata });
}
