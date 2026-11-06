import { HttpStatus } from '@nestjs/common';
import { v1Error, V1ErrorEnvelope } from 'src/shared/api-v1/envelope';
import { httpStatusForGrpc } from 'src/shared/grpc/grpc-http-status';
import {
  decodeStorageErrorDetail,
  STORAGE_ERROR_DETAIL_METADATA_KEY,
  StorageErrorDetail,
} from 'src/shared/grpc/storage-error-detail';
import { StorageRpcError } from './storage-rpc.error';
import { storageRpcFallbackKey, StorageRpcValidation } from './storage-rpc.validation';

export interface TranslatedStorageRpcError {
  statusCode: HttpStatus;
  body: V1ErrorEnvelope;
  /** `true` khi code/errorKey lấy từ detail Storage đã validate; `false` khi dùng mã fallback. */
  fromDetail: boolean;
}

function usableDetail(error: StorageRpcError, statusCode: HttpStatus) {
  const detail = decodeStorageErrorDetail(error.trailers.get(STORAGE_ERROR_DETAIL_METADATA_KEY));
  // Detail khai statusCode khác bảng R2 ⇒ Storage và Gateway lệch nhau; bỏ detail (fail-closed về mã chung).
  if (detail?.statusCode !== undefined && detail.statusCode !== statusCode) return undefined;
  return detail;
}

function clientMessage(detail: StorageErrorDetail, statusCode: HttpStatus, fallback: string) {
  // 5xx: luôn dùng message cố định — không đưa nội dung lỗi hạ tầng/stack ra client.
  if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) return fallback;
  return detail.message ?? fallback;
}

/**
 * gRPC error → envelope lỗi `/api/v1` (architecture R2 "Lỗi gRPC → HTTP").
 * - HTTP status: luôn từ gRPC status qua `httpStatusForGrpc` (DEADLINE_EXCEEDED→504, UNAVAILABLE→503…).
 * - code/errorKey/errors: từ detail `warehouse-error-bin` đã validate; thiếu/hỏng ⇒ mã fallback 1180xx.
 * - message: từ detail cho 4xx; 5xx dùng message cố định. Không bao giờ dùng `details`/stack của gRPC,
 *   không phân loại bằng regex trên message.
 * - traceId: traceId của request Gateway (đã gửi trong metadata), không lấy từ detail.
 */
export function translateStorageRpcError(
  error: StorageRpcError,
  now: Date = new Date(),
): TranslatedStorageRpcError {
  const statusCode = httpStatusForGrpc(error.grpcCode);
  const fallbackKey = storageRpcFallbackKey(error.grpcCode);
  const fallback = StorageRpcValidation[fallbackKey];
  const detail = usableDetail(error, statusCode);
  if (!detail) {
    return {
      statusCode,
      fromDetail: false,
      body: v1Error(
        {
          statusCode,
          code: fallback.code,
          errorKey: fallbackKey,
          message: fallback.message,
          traceId: error.traceId,
        },
        now,
      ),
    };
  }
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
