import { status as GrpcStatus } from '@grpc/grpc-js';
import { HttpStatus } from '@nestjs/common';
import { createErrorCode, TErrorCodeValue } from 'src/app/error-code.util';
import { httpStatusForGrpc } from 'src/shared/grpc/grpc-http-status';
import {
  CALLER_IDENTITY_REJECTED_CODE,
  CALLER_IDENTITY_REJECTED_ERROR_KEY,
} from 'src/shared/grpc/service-identity';

/**
 * Mã lỗi Gateway dùng khi Storage trả status gRPC KHÔNG kèm detail hợp lệ (lỗi transport, deadline phía
 * client, RPC chưa cài, detail hỏng). Dải 1180xx (chưa module nào dùng tại 4d1ee7a), số cuối = số gRPC status.
 * HTTP status lấy từ bảng R2 `httpStatusForGrpc`; status ngoài bảng ⇒ 500 (DEV-197-01).
 * Message an toàn, cố định — không chép message/stack từ Storage.
 *
 * Chưa gộp vào `AppValidation` (`src/app/` ngoài ownership I-01b, và lỗi v1 không đi qua `AppException`);
 * guard trùng mã của `AppValidation` vì vậy chưa phủ dải này — làm khi wiring route v1.
 */
export const STORAGE_RPC_CANCELLED = 'STORAGE_RPC_CANCELLED';
export const STORAGE_RPC_UNKNOWN = 'STORAGE_RPC_UNKNOWN';
export const STORAGE_RPC_INVALID_ARGUMENT = 'STORAGE_RPC_INVALID_ARGUMENT';
export const STORAGE_RPC_DEADLINE_EXCEEDED = 'STORAGE_RPC_DEADLINE_EXCEEDED';
export const STORAGE_RPC_NOT_FOUND = 'STORAGE_RPC_NOT_FOUND';
export const STORAGE_RPC_ALREADY_EXISTS = 'STORAGE_RPC_ALREADY_EXISTS';
export const STORAGE_RPC_PERMISSION_DENIED = 'STORAGE_RPC_PERMISSION_DENIED';
export const STORAGE_RPC_RESOURCE_EXHAUSTED = 'STORAGE_RPC_RESOURCE_EXHAUSTED';
export const STORAGE_RPC_FAILED_PRECONDITION = 'STORAGE_RPC_FAILED_PRECONDITION';
export const STORAGE_RPC_ABORTED = 'STORAGE_RPC_ABORTED';
export const STORAGE_RPC_OUT_OF_RANGE = 'STORAGE_RPC_OUT_OF_RANGE';
export const STORAGE_RPC_UNIMPLEMENTED = 'STORAGE_RPC_UNIMPLEMENTED';
export const STORAGE_RPC_INTERNAL = 'STORAGE_RPC_INTERNAL';
export const STORAGE_RPC_UNAVAILABLE = 'STORAGE_RPC_UNAVAILABLE';
export const STORAGE_RPC_DATA_LOSS = 'STORAGE_RPC_DATA_LOSS';
export const STORAGE_RPC_UNAUTHENTICATED = 'STORAGE_RPC_UNAUTHENTICATED';

export type TStorageRpcErrorCodeKey =
  | typeof STORAGE_RPC_CANCELLED
  | typeof STORAGE_RPC_UNKNOWN
  | typeof STORAGE_RPC_INVALID_ARGUMENT
  | typeof STORAGE_RPC_DEADLINE_EXCEEDED
  | typeof STORAGE_RPC_NOT_FOUND
  | typeof STORAGE_RPC_ALREADY_EXISTS
  | typeof STORAGE_RPC_PERMISSION_DENIED
  | typeof STORAGE_RPC_RESOURCE_EXHAUSTED
  | typeof STORAGE_RPC_FAILED_PRECONDITION
  | typeof STORAGE_RPC_ABORTED
  | typeof STORAGE_RPC_OUT_OF_RANGE
  | typeof STORAGE_RPC_UNIMPLEMENTED
  | typeof STORAGE_RPC_INTERNAL
  | typeof STORAGE_RPC_UNAVAILABLE
  | typeof STORAGE_RPC_DATA_LOSS
  | typeof STORAGE_RPC_UNAUTHENTICATED;

const INTERNAL_MESSAGE = 'Internal error';
const code = (value: number, message: string, grpc: GrpcStatus) =>
  createErrorCode(value, message, httpStatusForGrpc(grpc));

export const StorageRpcValidation: Record<TStorageRpcErrorCodeKey, TErrorCodeValue> = {
  STORAGE_RPC_CANCELLED: code(118001, INTERNAL_MESSAGE, GrpcStatus.CANCELLED),
  STORAGE_RPC_UNKNOWN: code(118002, INTERNAL_MESSAGE, GrpcStatus.UNKNOWN),
  STORAGE_RPC_INVALID_ARGUMENT: code(118003, 'Invalid request', GrpcStatus.INVALID_ARGUMENT),
  STORAGE_RPC_DEADLINE_EXCEEDED: code(
    118004,
    'Request timed out; the result is unknown',
    GrpcStatus.DEADLINE_EXCEEDED,
  ),
  STORAGE_RPC_NOT_FOUND: code(118005, 'Resource not found', GrpcStatus.NOT_FOUND),
  STORAGE_RPC_ALREADY_EXISTS: code(118006, INTERNAL_MESSAGE, GrpcStatus.ALREADY_EXISTS),
  STORAGE_RPC_PERMISSION_DENIED: code(118007, 'Permission denied', GrpcStatus.PERMISSION_DENIED),
  STORAGE_RPC_RESOURCE_EXHAUSTED: code(118008, 'Too many requests', GrpcStatus.RESOURCE_EXHAUSTED),
  STORAGE_RPC_FAILED_PRECONDITION: code(118009, 'Conflict', GrpcStatus.FAILED_PRECONDITION),
  STORAGE_RPC_ABORTED: code(118010, 'Conflict', GrpcStatus.ABORTED),
  STORAGE_RPC_OUT_OF_RANGE: code(118011, INTERNAL_MESSAGE, GrpcStatus.OUT_OF_RANGE),
  STORAGE_RPC_UNIMPLEMENTED: code(118012, INTERNAL_MESSAGE, GrpcStatus.UNIMPLEMENTED),
  STORAGE_RPC_INTERNAL: code(118013, INTERNAL_MESSAGE, GrpcStatus.INTERNAL),
  STORAGE_RPC_UNAVAILABLE: code(118014, 'Service temporarily unavailable', GrpcStatus.UNAVAILABLE),
  STORAGE_RPC_DATA_LOSS: code(118015, INTERNAL_MESSAGE, GrpcStatus.DATA_LOSS),
  STORAGE_RPC_UNAUTHENTICATED: code(118016, 'Authentication required', GrpcStatus.UNAUTHENTICATED),
};

/** Key fallback theo gRPC status (OK không phải lỗi ⇒ coi như INTERNAL). */
export function storageRpcFallbackKey(grpc: GrpcStatus): TStorageRpcErrorCodeKey {
  const key = `STORAGE_RPC_${GrpcStatus[grpc]}`;
  return key in StorageRpcValidation ? (key as TStorageRpcErrorCodeKey) : STORAGE_RPC_INTERNAL;
}

/**
 * Mã đặc biệt dải 1181xx (review I-01b), KHÔNG theo bảng gRPC → HTTP:
 * - `STORAGE_CALLER_IDENTITY_REJECTED` (118101): Storage từ chối service identity của Gateway (marker
 *   trong `service-identity.ts`) ⇒ 503: sự cố cấu hình cert/allowlist, không phải lỗi phiên/quyền user.
 * - `GATEWAY_AUTHORIZATION_MALFORMED` (118102): header `Authorization` có ký tự không gửi được qua gRPC
 *   (TAB, CR/LF, non-ASCII…) ⇒ 401 như thiếu/sai token; RPC không được gửi, giá trị không vào log.
 */
export const STORAGE_CALLER_IDENTITY_REJECTED = CALLER_IDENTITY_REJECTED_ERROR_KEY;
export const GATEWAY_AUTHORIZATION_MALFORMED = 'GATEWAY_AUTHORIZATION_MALFORMED';

export type TStorageRpcSpecialKey =
  typeof STORAGE_CALLER_IDENTITY_REJECTED | typeof GATEWAY_AUTHORIZATION_MALFORMED;

export const StorageRpcSpecialValidation: Record<TStorageRpcSpecialKey, TErrorCodeValue> = {
  [STORAGE_CALLER_IDENTITY_REJECTED]: createErrorCode(
    CALLER_IDENTITY_REJECTED_CODE,
    'Service temporarily unavailable',
    HttpStatus.SERVICE_UNAVAILABLE,
  ),
  [GATEWAY_AUTHORIZATION_MALFORMED]: createErrorCode(
    118102,
    'Authentication required',
    HttpStatus.UNAUTHORIZED,
  ),
};
