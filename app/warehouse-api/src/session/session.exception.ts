import { V1FieldError } from 'src/shared/api-v1/envelope';
import { SessionErrorCodeValue, SessionValidation } from './session.validation';

/**
 * Lỗi nghiệp vụ phiên phía Storage. Không phải `HttpException`: handler gRPC chuyển nó thành gRPC status +
 * detail `warehouse-error-bin` (`toStorageRpcFailure` trong `src/grpc/storage/auth`).
 * Message luôn là message cố định của mã — không chứa token/password/identifier.
 */
export class SessionException extends Error {
  constructor(
    readonly error: SessionErrorCodeValue,
    readonly fieldErrors: readonly V1FieldError[] = [],
  ) {
    super(error.message);
    this.name = 'SessionException';
  }
}

/** Lỗi validation đầu vào: 1 mã chung + danh sách lỗi từng field. */
export function invalidRequest(fieldErrors: readonly V1FieldError[]): SessionException {
  return new SessionException(SessionValidation.SESSION_REQUEST_INVALID, fieldErrors);
}
