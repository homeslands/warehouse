/**
 * Hằng số phiên đăng nhập R2 (W02 I-02). Nguồn:
 * - business-rules §20: access 15 phút, refresh ≤ 7 ngày + rotation/reuse-revoke, idle 30 phút do server,
 *   polling/refresh không gia hạn idle, activity endpoint có rate limit;
 * - business-rules §21: login 20 lần/phút theo IP + identifier, refresh 30 lần/phút/session;
 * - business-rules §16: password mới 12..72 byte UTF-8 (min 12 ký tự, max 72 byte để bcrypt không cắt);
 * - D14 mục 1-2; OpenAPI `LoginResult.expiresIn` const 900.
 */
const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const ACCESS_TOKEN_TTL_SECONDS = 900;
/**
 * Tuổi tối đa tuyệt đối của phiên (và của mọi refresh token trong family), tính từ lúc login.
 * R2 ghi "refresh ≤ 7 ngày" — chọn mốc tuyệt đối từ login (chặt nhất trong cách hiểu của "≤"),
 * rotation không kéo dài phiên. Ghi ở handoff I-02 (Q-I02-03).
 */
export const SESSION_MAX_LIFETIME_MS = 7 * DAY_MS;
export const SESSION_IDLE_TIMEOUT_MS = 30 * MINUTE_MS;

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export const LOGIN_RATE_LIMIT: RateLimitRule = { limit: 20, windowMs: MINUTE_MS };
export const REFRESH_RATE_LIMIT: RateLimitRule = { limit: 30, windowMs: MINUTE_MS };
/**
 * R2 chỉ ghi "activity endpoint ... rate limit", KHÔNG cho con số. Tạm dùng cùng ngưỡng với refresh
 * (30/phút/session) — DEV-197-10, chờ BA/Tech Lead chốt.
 */
export const ACTIVITY_RATE_LIMIT: RateLimitRule = { limit: 30, windowMs: MINUTE_MS };
/**
 * Số lần thử đổi mật khẩu (so mật khẩu hiện tại) mỗi user mỗi phút. R2 không cho con số — tạm 10/phút
 * (DEV-197-13, review I-02a L2), chờ BA/Tech Lead chốt.
 */
export const CHANGE_PASSWORD_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: MINUTE_MS };

/**
 * Định dạng identifier khi login: OpenAPI R2 `User.phoneNumber` (`^\+?[0-9]{9,15}$`), chỉ chữ số ASCII
 * (bao trùm regex legacy `VN_PHONENUMBER_REGEX`). Chặn biến thể fullwidth/Arabic-Indic mà collation
 * `utf8mb4_0900_ai_ci` coi là bằng nhau (review I-02a M2).
 */
export const LOGIN_PHONE_NUMBER_FORMAT = /^\+?[0-9]{9,15}$/;

export const PASSWORD_MIN_CHARACTERS = 12;
export const PASSWORD_MAX_UTF8_BYTES = 72;
/** OpenAPI `Login.password.maxLength`. */
export const LOGIN_PASSWORD_MAX_LENGTH = 128;
/** Giới hạn đầu vào cho identifier khi login (cột `phonenumber_column` VARCHAR(20) + biên an toàn). */
export const LOGIN_PHONE_MAX_LENGTH = 32;
export const USER_AGENT_MAX_LENGTH = 500;
/** IPv6 dạng chữ dài nhất (kể cả IPv4-mapped) là 45 ký tự — khớp cột `ip_address_column`. */
export const IP_ADDRESS_MAX_LENGTH = 45;

/** Refresh token: 32 byte ngẫu nhiên, base64url (43 ký tự). Chỉ SHA-256 hex được lưu DB. */
export const REFRESH_TOKEN_BYTES = 32;

/** List phiên (OpenAPI `listOwnSessions`): pageSize 1..100, mặc định 20; q ≤ 200. */
export const SESSION_LIST_DEFAULT_PAGE_SIZE = 20;
export const SESSION_LIST_MAX_PAGE_SIZE = 100;
export const LIST_QUERY_MAX_LENGTH = 200;

/** Claim/tham số JWT access v1 — khác hẳn token legacy để 2 loại không dùng lẫn được. */
export const ACCESS_TOKEN_ISSUER = 'warehouse-storage';
export const ACCESS_TOKEN_AUDIENCE = 'warehouse-api-v1';
export const ACCESS_TOKEN_TYPE = 'wh-v1-access';
export const ACCESS_TOKEN_ALGORITHM = 'HS256';
/** HS256: secret tối thiểu 32 byte. */
export const ACCESS_TOKEN_SECRET_MIN_LENGTH = 32;

/** Lý do thu hồi (cột `revoke_reason_column`, VARCHAR(32)). */
export enum SessionRevokeReason {
  Logout = 'LOGOUT',
  LogoutAll = 'LOGOUT_ALL',
  UserRevoked = 'USER_REVOKED',
  RefreshTokenReuse = 'REFRESH_TOKEN_REUSE',
  PasswordChanged = 'PASSWORD_CHANGED',
}

/** Trạng thái trả trong `ActionResult.status` (OpenAPI để `string` tự do). */
export enum SessionActionStatus {
  Revoked = 'REVOKED',
  Locked = 'LOCKED',
  ActivityRecorded = 'ACTIVITY_RECORDED',
  PasswordChanged = 'PASSWORD_CHANGED',
}

/** Key cấu hình (đọc qua ConfigService ở composition root Storage). */
export const SESSION_CONFIG_KEYS = {
  accessTokenSecret: 'V1_ACCESS_TOKEN_SECRET',
  saltRounds: 'SALT_ROUNDS',
  rateLimitPrefix: 'V1_RATE_LIMIT_REDIS_PREFIX',
} as const;
