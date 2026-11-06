import { status as GrpcStatus } from '@grpc/grpc-js';
import { createErrorCode } from 'src/app/error-code.util';
import { httpStatusForGrpc } from 'src/shared/grpc/grpc-http-status';
import { SessionException } from 'src/session/session.exception';
import { SessionErrorCodeValue } from 'src/session/session.validation';
import { V1FieldError } from 'src/shared/api-v1/envelope';

/**
 * Mã lỗi RBAC v1 phía Storage (W02 I-03a), dải 1184xx. Cùng cấu trúc với mã phiên (errorKey + gRPC status,
 * HTTP suy từ bảng R2) để dùng chung đường map lỗi RPC → envelope v1.
 */
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

export const RbacValidation = {
  RBAC_PERMISSION_DENIED: code(
    118401,
    'RBAC_PERMISSION_DENIED',
    'Permission denied',
    GrpcStatus.PERMISSION_DENIED,
  ),
  RBAC_FAMILY_UNRESOLVED: code(
    118402,
    'RBAC_FAMILY_UNRESOLVED',
    'Permission denied',
    GrpcStatus.PERMISSION_DENIED,
  ),
  RBAC_FAMILY_CEILING: code(
    118403,
    'RBAC_FAMILY_CEILING',
    'Authority is not allowed for this role family',
    GrpcStatus.PERMISSION_DENIED,
  ),
  RBAC_ROLE_LEVEL_FORBIDDEN: code(
    118404,
    'RBAC_ROLE_LEVEL_FORBIDDEN',
    'You can only manage roles below your own level',
    GrpcStatus.PERMISSION_DENIED,
  ),
  RBAC_ROLE_NOT_FOUND: code(118405, 'RBAC_ROLE_NOT_FOUND', 'Role not found', GrpcStatus.NOT_FOUND),
  RBAC_AUTHORITY_NOT_FOUND: code(
    118406,
    'RBAC_AUTHORITY_NOT_FOUND',
    'Authority not found',
    GrpcStatus.NOT_FOUND,
  ),
  RBAC_VERSION_CONFLICT: code(
    118407,
    'RBAC_VERSION_CONFLICT',
    'The resource was changed by someone else; reload and retry',
    GrpcStatus.ABORTED,
  ),
  RBAC_ROLE_BUILT_IN: code(
    118408,
    'RBAC_ROLE_BUILT_IN',
    'Built-in roles cannot be renamed or deleted',
    GrpcStatus.FAILED_PRECONDITION,
  ),
  RBAC_ROLE_IN_USE: code(
    118409,
    'RBAC_ROLE_IN_USE',
    'Role is assigned to users',
    GrpcStatus.FAILED_PRECONDITION,
  ),
  RBAC_AUTHORITY_FIXED_INVARIANT: code(
    118410,
    'RBAC_AUTHORITY_FIXED_INVARIANT',
    'This authority is a fixed invariant and cannot be changed',
    GrpcStatus.FAILED_PRECONDITION,
  ),
  RBAC_REQUEST_INVALID: code(
    118411,
    'RBAC_REQUEST_INVALID',
    'Invalid request',
    GrpcStatus.INVALID_ARGUMENT,
  ),
  RBAC_ROLE_NAME_TAKEN: code(
    118412,
    'RBAC_ROLE_NAME_TAKEN',
    'Role name already exists',
    GrpcStatus.FAILED_PRECONDITION,
  ),
} as const satisfies Record<string, SessionErrorCodeValue>;

export const RbacFieldErrorKey = {
  ID_INVALID: 'RBAC_ID_INVALID',
  VERSION_INVALID: 'RBAC_VERSION_INVALID',
  NAME_INVALID: 'RBAC_NAME_INVALID',
  DESCRIPTION_INVALID: 'RBAC_DESCRIPTION_INVALID',
  GROUP_INVALID: 'RBAC_GROUP_INVALID',
  AUTHORITY_CODE_INVALID: 'RBAC_AUTHORITY_CODE_INVALID',
  UPDATE_MASK_INVALID: 'RBAC_UPDATE_MASK_INVALID',
  PATCH_EMPTY: 'RBAC_PATCH_EMPTY',
  PAGE_INVALID: 'RBAC_PAGE_INVALID',
  PAGE_SIZE_INVALID: 'RBAC_PAGE_SIZE_INVALID',
  QUERY_INVALID: 'RBAC_QUERY_INVALID',
  SORT_BY_UNSUPPORTED: 'RBAC_SORT_BY_UNSUPPORTED',
  SORT_INVALID: 'RBAC_SORT_INVALID',
} as const;

/** Lỗi RBAC v1 — kế thừa `SessionException` để handler/filter v1 dùng chung đường map lỗi. */
export class RbacException extends SessionException {
  constructor(error: SessionErrorCodeValue, fieldErrors: readonly V1FieldError[] = []) {
    super(error, fieldErrors);
    this.name = 'RbacException';
  }
}

export function rbacInvalid(fieldErrors: readonly V1FieldError[]): RbacException {
  return new RbacException(RbacValidation.RBAC_REQUEST_INVALID, fieldErrors);
}
