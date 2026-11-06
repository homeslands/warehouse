import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import {
  encodeStorageErrorDetail,
  STORAGE_ERROR_DETAIL_METADATA_KEY,
  StorageErrorDetail,
} from 'src/shared/grpc/storage-error-detail';
import { StorageRpcError } from './storage-rpc.error';
import { translateStorageRpcError } from './storage-rpc-error.translator';
import {
  GATEWAY_AUTHORIZATION_MALFORMED,
  storageRpcFallbackKey,
  StorageRpcSpecialValidation,
  StorageRpcValidation,
} from './storage-rpc.validation';
import {
  CALLER_IDENTITY_REJECTED_CODE,
  CALLER_IDENTITY_REJECTED_ERROR_KEY,
} from 'src/shared/grpc/service-identity';

const TRACE = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const NOW = new Date('2026-11-06T01:00:00.000Z');

const errorWith = (code: GrpcStatus, detail?: StorageErrorDetail) => {
  const trailers = new Metadata();
  if (detail) trailers.set(STORAGE_ERROR_DETAIL_METADATA_KEY, encodeStorageErrorDetail(detail));
  return new StorageRpcError('GetRole', code, TRACE, trailers);
};

describe('translateStorageRpcError', () => {
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
    [GrpcStatus.CANCELLED, 500],
    [GrpcStatus.UNKNOWN, 500],
    [GrpcStatus.ALREADY_EXISTS, 500],
    [GrpcStatus.OUT_OF_RANGE, 500],
    [GrpcStatus.UNIMPLEMENTED, 500],
    [GrpcStatus.DATA_LOSS, 500],
  ])('without detail maps gRPC %s to HTTP %s with the fallback code', (grpc, http) => {
    const key = storageRpcFallbackKey(grpc);
    const { statusCode, body, fromDetail } = translateStorageRpcError(errorWith(grpc), NOW);
    expect(statusCode).toBe(http);
    expect(fromDetail).toBe(false);
    expect(body).toEqual({
      statusCode: http,
      code: StorageRpcValidation[key].code,
      errorKey: key,
      message: StorageRpcValidation[key].message,
      traceId: TRACE,
      timestamp: NOW.toISOString(),
    });
    expect(StorageRpcValidation[key].statusCode).toBe(http);
  });

  it('uses code/errorKey/message/errors of a validated detail for 4xx', () => {
    const { body } = translateStorageRpcError(
      errorWith(GrpcStatus.INVALID_ARGUMENT, {
        code: 100_002,
        errorKey: 'ROLE_NAME_INVALID',
        message: 'Name is required',
        errors: [{ field: 'data.name', errorKey: 'ROLE_NAME_INVALID', message: 'Required' }],
      }),
      NOW,
    );
    expect(body).toEqual({
      statusCode: 422,
      code: 100_002,
      errorKey: 'ROLE_NAME_INVALID',
      message: 'Name is required',
      traceId: TRACE,
      timestamp: NOW.toISOString(),
      errors: [{ field: 'data.name', errorKey: 'ROLE_NAME_INVALID', message: 'Required' }],
    });
  });

  it('keeps detail code/errorKey but replaces message and drops field errors for 5xx', () => {
    const { statusCode, body } = translateStorageRpcError(
      errorWith(GrpcStatus.UNAVAILABLE, {
        code: 100_500,
        errorKey: 'REDIS_UNAVAILABLE',
        message: 'redis://10.0.0.5:6379 refused',
        errors: [{ field: 'x', errorKey: 'Y', message: 'z' }],
      }),
      NOW,
    );
    expect(statusCode).toBe(503);
    expect(body).toMatchObject({ code: 100_500, errorKey: 'REDIS_UNAVAILABLE' });
    expect(body.message).toBe(StorageRpcValidation.STORAGE_RPC_UNAVAILABLE.message);
    expect(body).not.toHaveProperty('errors');
  });

  it('falls back when the detail statusCode disagrees with the R2 table', () => {
    const { body, fromDetail } = translateStorageRpcError(
      errorWith(GrpcStatus.NOT_FOUND, { statusCode: 409, code: 9, errorKey: 'X', errors: [] }),
      NOW,
    );
    expect(fromDetail).toBe(false);
    expect(body.errorKey).toBe('STORAGE_RPC_NOT_FOUND');
  });

  it('uses the fallback message when a 4xx detail has no message', () => {
    const { body } = translateStorageRpcError(
      errorWith(GrpcStatus.NOT_FOUND, { code: 9, errorKey: 'ROLE_NOT_FOUND', errors: [] }),
      NOW,
    );
    expect(body.message).toBe(StorageRpcValidation.STORAGE_RPC_NOT_FOUND.message);
  });

  it('treats OK (not an error status) as INTERNAL', () => {
    expect(storageRpcFallbackKey(GrpcStatus.OK)).toBe('STORAGE_RPC_INTERNAL');
  });

  it('uses unique codes in the 1180xx range', () => {
    const codes = Object.values(StorageRpcValidation).map((value) => value.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((value) => expect(Math.floor(value / 100)).toBe(1180));
  });

  it('never exposes the gRPC error text on StorageRpcError', () => {
    const error = errorWith(GrpcStatus.INTERNAL);
    expect(error.message).toBe('Storage RPC GetRole failed with INTERNAL');
  });
});

describe('translateStorageRpcError — special cases (review I-01b)', () => {
  const marker: StorageErrorDetail = {
    code: CALLER_IDENTITY_REJECTED_CODE,
    errorKey: CALLER_IDENTITY_REJECTED_ERROR_KEY,
    errors: [],
  };

  it.each([GrpcStatus.UNAUTHENTICATED, GrpcStatus.PERMISSION_DENIED])(
    'maps a service-identity rejection with gRPC %s to 503, not 401/403',
    (grpc) => {
      const { statusCode, body, special } = translateStorageRpcError(errorWith(grpc, marker), NOW);
      expect(special).toBe('STORAGE_CALLER_IDENTITY_REJECTED');
      expect(statusCode).toBe(503);
      expect(body).toEqual({
        statusCode: 503,
        code: CALLER_IDENTITY_REJECTED_CODE,
        errorKey: 'STORAGE_CALLER_IDENTITY_REJECTED',
        message: 'Service temporarily unavailable',
        traceId: TRACE,
        timestamp: NOW.toISOString(),
      });
    },
  );

  it('keeps 401 for a user-session UNAUTHENTICATED without the marker', () => {
    const { statusCode, special } = translateStorageRpcError(
      errorWith(GrpcStatus.UNAUTHENTICATED, { code: 7, errorKey: 'SESSION_EXPIRED', errors: [] }),
      NOW,
    );
    expect(statusCode).toBe(401);
    expect(special).toBeUndefined();
  });

  it('ignores the marker on other statuses', () => {
    const { statusCode, special } = translateStorageRpcError(
      errorWith(GrpcStatus.NOT_FOUND, marker),
      NOW,
    );
    expect(statusCode).toBe(404);
    expect(special).toBeUndefined();
  });

  it('maps a Gateway-side malformed Authorization to 401 regardless of trailers', () => {
    const error = new StorageRpcError(
      'GetRole',
      GrpcStatus.UNAUTHENTICATED,
      TRACE,
      new Metadata(),
      GATEWAY_AUTHORIZATION_MALFORMED,
    );
    const { statusCode, body, special } = translateStorageRpcError(error, NOW);
    expect(special).toBe(GATEWAY_AUTHORIZATION_MALFORMED);
    expect(statusCode).toBe(401);
    expect(body).toMatchObject({
      code: StorageRpcSpecialValidation.GATEWAY_AUTHORIZATION_MALFORMED.code,
      errorKey: 'GATEWAY_AUTHORIZATION_MALFORMED',
    });
    expect(error.message).toBe('Storage RPC GetRole not sent: GATEWAY_AUTHORIZATION_MALFORMED');
  });

  it('uses unique 1181xx codes that do not collide with the fallback table', () => {
    const special = Object.values(StorageRpcSpecialValidation).map((value) => value.code);
    const fallback = new Set(Object.values(StorageRpcValidation).map((value) => value.code));
    special.forEach((value) => {
      expect(Math.floor(value / 100)).toBe(1181);
      expect(fallback.has(value)).toBe(false);
    });
    expect(new Set(special).size).toBe(special.length);
  });
});
