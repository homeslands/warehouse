import { status as GrpcStatus } from '@grpc/grpc-js';
import { HttpStatus } from '@nestjs/common';
import { v1Error, V1ErrorEnvelope } from 'src/shared/api-v1/envelope';
import { httpStatusForGrpc } from 'src/shared/grpc/grpc-http-status';
import { CALLER_IDENTITY_REJECTED_ERROR_KEY } from 'src/shared/grpc/service-identity';
import {
  decodeStorageErrorDetail,
  STORAGE_ERROR_DETAIL_METADATA_KEY,
  StorageErrorDetail,
} from 'src/shared/grpc/storage-error-detail';
import { StorageRpcError } from './storage-rpc.error';
import {
  STORAGE_CALLER_IDENTITY_REJECTED,
  storageRpcFallbackKey,
  StorageRpcSpecialValidation,
  StorageRpcValidation,
  TStorageRpcSpecialKey,
} from './storage-rpc.validation';

export interface TranslatedStorageRpcError {
  statusCode: HttpStatus;
  body: V1ErrorEnvelope;
  /** `true` khi code/errorKey lấy từ detail Storage đã validate; `false` khi dùng mã của Gateway. */
  fromDetail: boolean;
  /** Đặt khi lỗi thuộc nhóm đặc biệt 1181xx (identity service bị từ chối, Authorization sai định dạng). */
  special?: TStorageRpcSpecialKey;
}

/** Status mà interceptor allowlist của Storage dùng khi từ chối service identity. */
const IDENTITY_REJECTION_STATUSES: ReadonlySet<GrpcStatus> = new Set([
  GrpcStatus.UNAUTHENTICATED,
  GrpcStatus.PERMISSION_DENIED,
]);

function clientMessage(detail: StorageErrorDetail, statusCode: HttpStatus, fallback: string) {
  // 5xx: luôn dùng message cố định — không đưa nội dung lỗi hạ tầng/stack ra client.
  if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) return fallback;
  return detail.message ?? fallback;
}

function specialKey(
  error: StorageRpcError,
  detail: StorageErrorDetail | undefined,
): TStorageRpcSpecialKey | undefined {
  if (error.gatewayReason) return error.gatewayReason;
  const isIdentityRejection =
    IDENTITY_REJECTION_STATUSES.has(error.grpcCode) &&
    detail?.errorKey === CALLER_IDENTITY_REJECTED_ERROR_KEY;
  return isIdentityRejection ? STORAGE_CALLER_IDENTITY_REJECTED : undefined;
}

function fromGatewayCode(
  error: StorageRpcError,
  key: string,
  value: { code: number; message: string; statusCode: HttpStatus },
  now: Date,
): Pick<TranslatedStorageRpcError, 'statusCode' | 'body'> {
  return {
    statusCode: value.statusCode,
    body: v1Error(
      {
        statusCode: value.statusCode,
        code: value.code,
        errorKey: key,
        message: value.message,
        traceId: error.traceId,
      },
      now,
    ),
  };
}

/**
 * gRPC error → envelope lỗi `/api/v1` (architecture R2 "Lỗi gRPC → HTTP").
 * - Nhóm đặc biệt 1181xx (review I-01b): Storage từ chối service identity của Gateway
 *   (UNAUTHENTICATED/PERMISSION_DENIED + marker) ⇒ 503, không trả 401/403 cho user; Gateway từ chối
 *   header Authorization sai định dạng ⇒ 401. Cả hai dùng mã/message cố định.
 * - Còn lại: HTTP status từ `httpStatusForGrpc` (DEADLINE_EXCEEDED→504, UNAVAILABLE→503…);
 *   code/errorKey/errors từ detail `warehouse-error-bin` đã validate; thiếu/hỏng/lệch statusCode ⇒ mã
 *   fallback 1180xx.
 * - message: từ detail cho 4xx; 5xx dùng message cố định. Không bao giờ dùng `details`/stack của gRPC,
 *   không phân loại bằng regex trên message.
 * - traceId: traceId của request Gateway (đã gửi trong metadata), không lấy từ detail.
 */
export function translateStorageRpcError(
  error: StorageRpcError,
  now: Date = new Date(),
): TranslatedStorageRpcError {
  const detail = decodeStorageErrorDetail(error.trailers.get(STORAGE_ERROR_DETAIL_METADATA_KEY));
  const special = specialKey(error, detail);
  if (special)
    return {
      ...fromGatewayCode(error, special, StorageRpcSpecialValidation[special], now),
      fromDetail: false,
      special,
    };

  const statusCode = httpStatusForGrpc(error.grpcCode);
  // Detail khai statusCode khác bảng R2 ⇒ Storage và Gateway lệch nhau; bỏ detail (fail-closed về mã chung).
  const usable = detail?.statusCode === undefined || detail.statusCode === statusCode;
  if (!detail || !usable) {
    const key = storageRpcFallbackKey(error.grpcCode);
    return { ...fromGatewayCode(error, key, StorageRpcValidation[key], now), fromDetail: false };
  }
  const fallback = StorageRpcValidation[storageRpcFallbackKey(error.grpcCode)];
  const isClientError = statusCode < HttpStatus.INTERNAL_SERVER_ERROR;
  return {
    statusCode,
    fromDetail: true,
    body: v1Error(
      {
        statusCode,
        code: detail.code,
        errorKey: detail.errorKey,
        message: clientMessage(detail, statusCode, fallback.message),
        traceId: error.traceId,
        // Field errors chỉ có nghĩa với lỗi phía client (422…); 5xx không trả chi tiết.
        errors: isClientError ? detail.errors : [],
      },
      now,
    ),
  };
}
