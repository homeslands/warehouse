import { status as GrpcStatus } from '@grpc/grpc-js';
import { createErrorCode, TErrorCodeValue } from 'src/app/error-code.util';
import { httpStatusForGrpc } from 'src/shared/grpc/grpc-http-status';

/**
 * Mã lỗi phiên đăng nhập v1 phía Storage (W02 I-02), dải 1182xx — nối tiếp dải 1180xx/1181xx của lỗi RPC
 * Gateway ↔ Storage (`src/grpc/gateway/storage-rpc.validation.ts`). Chưa gộp vào `AppValidation`
 * (`src/app/` ngoài ownership, lỗi v1 không đi qua `AppException`) — cùng hạng mục DEV-197-04.
 *
 * Mỗi mã mang gRPC status Storage trả; HTTP status suy từ bảng R2 (`httpStatusForGrpc`) để Gateway và
 * Storage không lệch nhau (translator bỏ detail nếu `statusCode` khác bảng).
 *
 * Message an toàn, cố định: lỗi đăng nhập dùng 1 thông điệp chung, không tiết lộ tài khoản tồn tại
 * (business-rules §21, TC-AUTH-02).
 */
export interface SessionErrorCodeValue extends TErrorCodeValue {
  errorKey: string;
  grpcStatus: GrpcStatus;
}

const code = (
  value: number,
  errorKey: string,
  message: string,
  grpcStatus: GrpcStatus,
): SessionErrorCodeValue => ({
  ...createErrorCode(value, message, httpStatusForGrpc(grpcStatus)),
  errorKey,
  grpcStatus,
});

const UNAUTHENTICATED_MESSAGE = 'Authentication required';

export const SessionValidation = {
  SESSION_INVALID_CREDENTIALS: code(
    118201,
    'SESSION_INVALID_CREDENTIALS',
    'Invalid phone number or password',
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_LOGIN_RATE_LIMITED: code(
    118202,
    'SESSION_LOGIN_RATE_LIMITED',
    'Too many login attempts, please try again later',
    GrpcStatus.RESOURCE_EXHAUSTED,
  ),
  SESSION_REFRESH_RATE_LIMITED: code(
    118203,
    'SESSION_REFRESH_RATE_LIMITED',
    'Too many refresh requests, please try again later',
    GrpcStatus.RESOURCE_EXHAUSTED,
  ),
  SESSION_ACTIVITY_RATE_LIMITED: code(
    118204,
    'SESSION_ACTIVITY_RATE_LIMITED',
    'Too many activity requests, please try again later',
    GrpcStatus.RESOURCE_EXHAUSTED,
  ),
  SESSION_ACCESS_TOKEN_MISSING: code(
    118205,
    'SESSION_ACCESS_TOKEN_MISSING',
    UNAUTHENTICATED_MESSAGE,
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_ACCESS_TOKEN_INVALID: code(
    118206,
    'SESSION_ACCESS_TOKEN_INVALID',
    UNAUTHENTICATED_MESSAGE,
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_ACCESS_TOKEN_EXPIRED: code(
    118207,
    'SESSION_ACCESS_TOKEN_EXPIRED',
    'Access token has expired',
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_REVOKED: code(
    118208,
    'SESSION_REVOKED',
    'Session has been revoked, please login again',
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_IDLE_EXPIRED: code(
    118209,
    'SESSION_IDLE_EXPIRED',
    'Session is locked due to inactivity, please login again',
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_LOCKED: code(
    118210,
    'SESSION_LOCKED',
    'Session is locked, please login again',
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_EXPIRED: code(
    118211,
    'SESSION_EXPIRED',
    'Session has expired, please login again',
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_USER_INACTIVE: code(
    118212,
    'SESSION_USER_INACTIVE',
    UNAUTHENTICATED_MESSAGE,
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_REFRESH_TOKEN_INVALID: code(
    118213,
    'SESSION_REFRESH_TOKEN_INVALID',
    UNAUTHENTICATED_MESSAGE,
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_REFRESH_TOKEN_REUSED: code(
    118214,
    'SESSION_REFRESH_TOKEN_REUSED',
    'Session has been revoked, please login again',
    GrpcStatus.UNAUTHENTICATED,
  ),
  SESSION_NOT_FOUND: code(118215, 'SESSION_NOT_FOUND', 'Session not found', GrpcStatus.NOT_FOUND),
  SESSION_REQUEST_INVALID: code(
    118216,
    'SESSION_REQUEST_INVALID',
    'Invalid request',
    GrpcStatus.INVALID_ARGUMENT,
  ),
  SESSION_CURRENT_PASSWORD_INCORRECT: code(
    118217,
    'SESSION_CURRENT_PASSWORD_INCORRECT',
    'Current password is incorrect',
    GrpcStatus.INVALID_ARGUMENT,
  ),
  SESSION_STORE_UNAVAILABLE: code(
    118218,
    'SESSION_STORE_UNAVAILABLE',
    'Service temporarily unavailable',
    GrpcStatus.UNAVAILABLE,
  ),
  SESSION_CLIENT_IP_MISSING: code(
    118219,
    'SESSION_CLIENT_IP_MISSING',
    'Service temporarily unavailable',
    GrpcStatus.UNAVAILABLE,
  ),
  SESSION_CHANGE_PASSWORD_RATE_LIMITED: code(
    118220,
    'SESSION_CHANGE_PASSWORD_RATE_LIMITED',
    'Too many password change attempts, please try again later',
    GrpcStatus.RESOURCE_EXHAUSTED,
  ),
} as const satisfies Record<string, SessionErrorCodeValue>;

/** `FieldError.errorKey` cho lỗi validation từng field (đi kèm `SESSION_REQUEST_INVALID`). */
export const SessionFieldErrorKey = {
  PHONE_NUMBER_REQUIRED: 'SESSION_PHONE_NUMBER_REQUIRED',
  PHONE_NUMBER_TOO_LONG: 'SESSION_PHONE_NUMBER_TOO_LONG',
  PASSWORD_REQUIRED: 'SESSION_PASSWORD_REQUIRED',
  PASSWORD_TOO_LONG: 'SESSION_PASSWORD_TOO_LONG',
  CURRENT_PASSWORD_REQUIRED: 'SESSION_CURRENT_PASSWORD_REQUIRED',
  CURRENT_PASSWORD_INCORRECT: 'SESSION_CURRENT_PASSWORD_INCORRECT',
  NEW_PASSWORD_REQUIRED: 'SESSION_NEW_PASSWORD_REQUIRED',
  NEW_PASSWORD_TOO_SHORT: 'SESSION_NEW_PASSWORD_TOO_SHORT',
  NEW_PASSWORD_TOO_LONG: 'SESSION_NEW_PASSWORD_TOO_LONG',
  SESSION_ID_INVALID: 'SESSION_ID_INVALID',
  PAGE_INVALID: 'SESSION_PAGE_INVALID',
  PAGE_SIZE_INVALID: 'SESSION_PAGE_SIZE_INVALID',
  QUERY_UNSUPPORTED: 'SESSION_QUERY_UNSUPPORTED',
  SORT_BY_UNSUPPORTED: 'SESSION_SORT_BY_UNSUPPORTED',
  SORT_INVALID: 'SESSION_SORT_INVALID',
} as const;
