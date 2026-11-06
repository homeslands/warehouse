/**
 * Hằng dùng chung cho runtime gRPC Gateway ↔ Storage (W02 I-01b).
 *
 * Metadata key (architecture R2 "Đường tin cậy" bước 2 và 4):
 * - `authorization`: JWT gốc của caller, Gateway chuyển tiếp nguyên văn header HTTP. Storage tự kiểm.
 * - `x-trace-id`: UUID do Gateway sinh/chuẩn hoá bằng `normalizeTraceId`.
 * R2 không đặt tên key cho traceId; `x-trace-id` theo chỉ đạo điều phối #197 (DEV-197-03).
 */
export const AUTHORIZATION_METADATA_KEY = 'authorization';
export const TRACE_ID_METADATA_KEY = 'x-trace-id';

/** Tên TLS (SAN DNS) của cert Storage mà Gateway kiểm khi kết nối, khi địa chỉ là IP/loopback. */
export const GRPC_SSL_TARGET_NAME_OVERRIDE = 'grpc.ssl_target_name_override';
export const GRPC_DEFAULT_AUTHORITY = 'grpc.default_authority';

/**
 * Biến cấu hình của Gateway client (đọc qua ConfigService). Chưa khai trong `env.validation.ts`
 * vì client chưa được gắn vào composition root nào (I-01b chỉ làm nền); thêm khi wiring ở I-02.
 * Không có giá trị mặc định cho deadline: R2 không định nghĩa con số, nên bắt buộc cấu hình.
 */
export const STORAGE_GRPC_CONFIG_KEYS = {
  address: 'STORAGE_GRPC_ADDRESS',
  serverName: 'STORAGE_GRPC_SERVER_NAME',
  caPath: 'STORAGE_GRPC_CA_PATH',
  certPath: 'GATEWAY_GRPC_CERT_PATH',
  keyPath: 'GATEWAY_GRPC_KEY_PATH',
  deadlineMs: 'STORAGE_GRPC_DEADLINE_MS',
} as const;

/** Thời gian chờ server đóng êm (ms) trước khi buộc huỷ các call còn treo. */
export const GRPC_SERVER_SHUTDOWN_GRACE_MS = 5_000;
