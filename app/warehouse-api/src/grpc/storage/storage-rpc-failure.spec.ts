import { status as GrpcStatus } from '@grpc/grpc-js';
import {
  CALLER_IDENTITY_REJECTED_CODE,
  CALLER_IDENTITY_REJECTED_ERROR_KEY,
} from 'src/shared/grpc/service-identity';
import {
  decodeStorageErrorDetail,
  STORAGE_ERROR_DETAIL_METADATA_KEY,
} from 'src/shared/grpc/storage-error-detail';
import { storageRpcFailure } from './storage-grpc.server';

describe('storageRpcFailure (follow-up I1 from review I-01b)', () => {
  it.each([GrpcStatus.UNAUTHENTICATED, GrpcStatus.PERMISSION_DENIED, GrpcStatus.INTERNAL])(
    'refuses the reserved caller-identity marker from handlers (status %s)',
    (code) => {
      expect(() =>
        storageRpcFailure(code, {
          code: CALLER_IDENTITY_REJECTED_CODE,
          errorKey: CALLER_IDENTITY_REJECTED_ERROR_KEY,
          errors: [],
        }),
      ).toThrow(RangeError);
    },
  );

  it('still encodes ordinary session errors with a validated detail', () => {
    const failure = storageRpcFailure(GrpcStatus.UNAUTHENTICATED, {
      statusCode: 401,
      code: 118209,
      errorKey: 'SESSION_IDLE_EXPIRED',
      message: 'Session is locked due to inactivity, please login again',
      errors: [],
    });
    expect(failure.code).toBe(GrpcStatus.UNAUTHENTICATED);
    expect(
      decodeStorageErrorDetail(failure.metadata.get(STORAGE_ERROR_DETAIL_METADATA_KEY)),
    ).toMatchObject({ code: 118209, errorKey: 'SESSION_IDLE_EXPIRED', statusCode: 401 });
  });
});
