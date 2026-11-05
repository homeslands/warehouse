import { status as GrpcStatus } from '@grpc/grpc-js';
import { HttpStatus } from '@nestjs/common';

/**
 * Bảng gRPC → HTTP của Gateway, theo `architecture-and-boundaries.md` mục "Lỗi gRPC → HTTP" (R2):
 *
 * | gRPC                               | HTTP |
 * |------------------------------------|------|
 * | UNAUTHENTICATED                    | 401  |
 * | PERMISSION_DENIED                  | 403  |
 * | NOT_FOUND                          | 404  |
 * | INVALID_ARGUMENT                   | 422  |
 * | FAILED_PRECONDITION / ABORTED      | 409  |
 * | RESOURCE_EXHAUSTED                 | 429  |
 * | UNAVAILABLE                        | 503  |
 * | DEADLINE_EXCEEDED                  | 504  |
 * | INTERNAL                           | 500  |
 *
 * Status không có trong bảng (CANCELLED, UNKNOWN, ALREADY_EXISTS, OUT_OF_RANGE, UNIMPLEMENTED,
 * DATA_LOSS) ⇒ 500 với message an toàn: R2 không định nghĩa, nên không tự gán mã nghiệp vụ.
 * Ghi nhận ở deviation DEV-197-01 để chốt khi Storage thật sự trả các status này.
 * Không phân loại lỗi bằng regex trên message (R2).
 */
const GRPC_TO_HTTP: ReadonlyMap<GrpcStatus, HttpStatus> = new Map<GrpcStatus, HttpStatus>([
  [GrpcStatus.UNAUTHENTICATED, HttpStatus.UNAUTHORIZED],
  [GrpcStatus.PERMISSION_DENIED, HttpStatus.FORBIDDEN],
  [GrpcStatus.NOT_FOUND, HttpStatus.NOT_FOUND],
  [GrpcStatus.INVALID_ARGUMENT, HttpStatus.UNPROCESSABLE_ENTITY],
  [GrpcStatus.FAILED_PRECONDITION, HttpStatus.CONFLICT],
  [GrpcStatus.ABORTED, HttpStatus.CONFLICT],
  [GrpcStatus.RESOURCE_EXHAUSTED, HttpStatus.TOO_MANY_REQUESTS],
  [GrpcStatus.UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE],
  [GrpcStatus.DEADLINE_EXCEEDED, HttpStatus.GATEWAY_TIMEOUT],
  [GrpcStatus.INTERNAL, HttpStatus.INTERNAL_SERVER_ERROR],
]);

export function httpStatusForGrpc(code: GrpcStatus): HttpStatus {
  return GRPC_TO_HTTP.get(code) ?? HttpStatus.INTERNAL_SERVER_ERROR;
}

/** Status mà R2 đã định nghĩa rõ (dùng cho test và cho log cảnh báo khi gặp status ngoài bảng). */
export function isMappedGrpcStatus(code: GrpcStatus): boolean {
  return GRPC_TO_HTTP.has(code);
}
