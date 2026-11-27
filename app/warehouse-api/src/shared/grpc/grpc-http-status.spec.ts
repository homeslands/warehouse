import { status as GrpcStatus } from '@grpc/grpc-js';
import { httpStatusForGrpc, isMappedGrpcStatus } from './grpc-http-status';

describe('httpStatusForGrpc (architecture R2 "Lỗi gRPC → HTTP")', () => {
  it.each([
    [GrpcStatus.UNAUTHENTICATED, 401],
    [GrpcStatus.PERMISSION_DENIED, 403],
    [GrpcStatus.NOT_FOUND, 404],
    [GrpcStatus.INVALID_ARGUMENT, 422],
    [GrpcStatus.FAILED_PRECONDITION, 409],
    [GrpcStatus.ABORTED, 409],
    [GrpcStatus.RESOURCE_EXHAUSTED, 429],
    [GrpcStatus.UNAVAILABLE, 503],
    [GrpcStatus.DEADLINE_EXCEEDED, 504],
    [GrpcStatus.INTERNAL, 500],
  ])('maps gRPC %s to HTTP %s', (code, http) => {
    expect(httpStatusForGrpc(code)).toBe(http);
    expect(isMappedGrpcStatus(code)).toBe(true);
  });

  it.each([
    GrpcStatus.CANCELLED,
    GrpcStatus.UNKNOWN,
    GrpcStatus.ALREADY_EXISTS,
    GrpcStatus.OUT_OF_RANGE,
    GrpcStatus.UNIMPLEMENTED,
    GrpcStatus.DATA_LOSS,
  ])('falls back to 500 for status %s that R2 does not define', (code) => {
    expect(httpStatusForGrpc(code)).toBe(500);
    expect(isMappedGrpcStatus(code)).toBe(false);
  });
});
