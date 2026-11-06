/**
 * Đánh dấu lỗi "service identity bị từ chối" (review I-01b L1). Interceptor allowlist của Storage vẫn trả
 * gRPC UNAUTHENTICATED / PERMISSION_DENIED (TC-ARC-01), nhưng đính detail `warehouse-error-bin` với
 * errorKey này. Gateway nhận ra marker và trả 503 thay vì 401/403: lỗi cấu hình cert/allowlist giữa
 * service là sự cố hạ tầng, không phải phiên/quyền của user. Trả 401 sẽ khiến FE refresh/đăng xuất
 * hàng loạt (fail-closed vẫn giữ: request không tới handler).
 * Marker chỉ có nghĩa đi kèm 2 status trên và đến từ Storage qua kênh mTLS.
 */
export const CALLER_IDENTITY_REJECTED_ERROR_KEY = 'STORAGE_CALLER_IDENTITY_REJECTED';
/** Thuộc dải 1180xx/1181xx của lỗi RPC Gateway ↔ Storage (`storage-rpc.validation.ts`). */
export const CALLER_IDENTITY_REJECTED_CODE = 118101;
