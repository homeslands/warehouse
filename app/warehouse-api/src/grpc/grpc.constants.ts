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

/**
 * Metadata phiên v1 (W02 I-02, DEV-197-07; R2 proto không có field cho các giá trị này):
 * - `x-client-ip` / `x-client-user-agent` (Gateway → Storage): IP/User-Agent của browser mà Gateway thấy,
 *   dùng cho throttle login theo IP + identifier và `Session.ipMasked`/`userAgent`. Chỉ tin vì đi qua kênh
 *   mTLS từ Gateway đã allowlist; không phải identity.
 * - `warehouse-refresh-token` (Storage → Gateway, response header metadata của Login/Refresh thành công):
 *   refresh token plaintext để Gateway đặt cookie HttpOnly. `LoginResult` không có field refresh token
 *   (JSON không được chứa nó). Không log, không chuyển tiếp vào body.
 */
export const CLIENT_IP_METADATA_KEY = 'x-client-ip';
export const CLIENT_USER_AGENT_METADATA_KEY = 'x-client-user-agent';
export const REFRESH_TOKEN_METADATA_KEY = 'warehouse-refresh-token';
/**
 * (I-02b) Mốc hết hạn tuyệt đối của phiên (ISO-8601 UTC) đi kèm refresh token, để Gateway đặt `Max-Age`
 * cookie đúng tuổi còn lại của phiên. Không phải secret. Cùng nhóm DEV-197-07.
 */
export const REFRESH_EXPIRES_AT_METADATA_KEY = 'warehouse-refresh-expires-at';

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

/**
 * Biên deadline một RPC unary Gateway → Storage (ms), áp cho cả cấu hình lẫn ghi đè theo call
 * (review I-01b L2). R2/NFR chưa cho con số; 30 000 ms là trần tạm, chờ Tech Lead chốt:
 * - unary W02 là đọc/ghi 1 transaction; việc dài (backup/restore) là job bất đồng bộ (202 + `getJob`);
 * - upload là client-stream (I-04) có deadline riêng;
 * - trần chặn cấu hình nhầm (thừa số 0) tạo deadline gần như vô hạn, giữ request HTTP treo.
 */
export const STORAGE_GRPC_MIN_DEADLINE_MS = 1;
export const STORAGE_GRPC_MAX_DEADLINE_MS = 30_000;
