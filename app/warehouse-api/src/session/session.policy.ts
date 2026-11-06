import { createHash, randomBytes } from 'crypto';
import { isIP } from 'net';
import { V1FieldError } from 'src/shared/api-v1/envelope';
import {
  IP_ADDRESS_MAX_LENGTH,
  PASSWORD_MAX_UTF8_BYTES,
  PASSWORD_MIN_CHARACTERS,
  REFRESH_TOKEN_BYTES,
  SESSION_IDLE_TIMEOUT_MS,
  USER_AGENT_MAX_LENGTH,
} from './session.constants';
import {
  SessionErrorCodeValue,
  SessionFieldErrorKey,
  SessionValidation,
} from './session.validation';

/** Đồng hồ inject được — test điều khiển thời gian, không sleep thật. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Trạng thái thời gian/thu hồi của 1 phiên (các field R2 tách riêng). */
export interface SessionState {
  revokedAt: Date | null;
  lockedAt: Date | null;
  idleExpiresAt: Date;
  expiresAt: Date;
}

/**
 * Phiên còn dùng được tại `now` không; không thì trả mã lỗi 401 tương ứng. Thứ tự ưu tiên: thu hồi →
 * khoá → hết tuổi tuyệt đối → idle. Biên: đúng tại mốc hết hạn là đã hết (`now >= mốc`).
 */
export function sessionUnusableReason(
  session: SessionState,
  now: Date,
): SessionErrorCodeValue | undefined {
  if (session.revokedAt) return SessionValidation.SESSION_REVOKED;
  if (session.lockedAt) return SessionValidation.SESSION_LOCKED;
  if (now.getTime() >= session.expiresAt.getTime()) return SessionValidation.SESSION_EXPIRED;
  if (now.getTime() >= session.idleExpiresAt.getTime())
    return SessionValidation.SESSION_IDLE_EXPIRED;
  return undefined;
}

/**
 * Mốc idle mới khi có hoạt động tương tác thật: `now + 30 phút`, không vượt tuổi tuyệt đối của phiên.
 * Chỉ `recordInteractiveActivity` (và login) gọi hàm này; refresh/polling KHÔNG (business-rules §20).
 */
export function nextIdleExpiry(now: Date, expiresAt: Date): Date {
  return new Date(Math.min(now.getTime() + SESSION_IDLE_TIMEOUT_MS, expiresAt.getTime()));
}

/** Trạng thái đã khoá trong transaction refresh (đọc lại sau `FOR UPDATE`). */
export interface RefreshCandidate {
  session: SessionState;
  family: { revokedAt: Date | null };
  hash: { usedAt: Date | null; currentFamilyId: string | null; expiresAt: Date };
  userActive: boolean;
}

export type RefreshDecision =
  | { action: 'rotate' }
  | { action: 'revoke-reuse' }
  | { action: 'reject'; error: SessionErrorCodeValue };

/**
 * Quyết định của 1 lần refresh (business-rules §20, #196 mục 5a):
 * 1. token không còn là hiện hành (đã dùng) ⇒ reuse ⇒ revoke family + phiên — xét TRƯỚC mọi điều kiện khác,
 *    để token cũ bị lộ luôn kích hoạt revoke kể cả khi phiên đã idle;
 * 2. family/phiên đã thu hồi, khoá, hết tuổi, idle ⇒ 401, không rotate, không tạo family mới (TC-AUTH-03);
 * 3. token quá hạn hoặc user không còn active ⇒ 401;
 * 4. còn lại ⇒ rotate (không gia hạn idle).
 */
export function decideRefresh(candidate: RefreshCandidate, now: Date): RefreshDecision {
  const { session, family, hash } = candidate;
  if (hash.usedAt !== null || hash.currentFamilyId === null) return { action: 'revoke-reuse' };
  if (family.revokedAt) return { action: 'reject', error: SessionValidation.SESSION_REVOKED };
  const unusable = sessionUnusableReason(session, now);
  if (unusable) return { action: 'reject', error: unusable };
  if (now.getTime() >= hash.expiresAt.getTime())
    return { action: 'reject', error: SessionValidation.SESSION_EXPIRED };
  if (!candidate.userActive)
    return { action: 'reject', error: SessionValidation.SESSION_USER_INACTIVE };
  return { action: 'rotate' };
}

/** Refresh token mới: 32 byte ngẫu nhiên (CSPRNG), base64url 43 ký tự. */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

const REFRESH_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedRefreshToken(value: unknown): value is string {
  return typeof value === 'string' && REFRESH_TOKEN_FORMAT.test(value);
}

/** SHA-256 hex (64 ký tự thường) — giá trị DUY NHẤT của refresh token được lưu DB. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Số ký tự theo code point Unicode (emoji/ký tự ngoài BMP tính 1), không theo UTF-16 unit. */
export function characterCount(value: string): number {
  return [...value].length;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * Mật khẩu mới (business-rules §16, OpenAPI `PasswordChange.newPassword` minLength 12,
 * `x-max-utf8-bytes` 72): tối thiểu 12 ký tự, tối đa 72 byte UTF-8 để bcrypt không cắt ngầm.
 * Không trim, không chuẩn hoá: mật khẩu được so đúng từng byte người dùng gõ.
 */
export function newPasswordErrors(field: string, value: unknown): V1FieldError[] {
  if (typeof value !== 'string' || value.length === 0)
    return [
      fieldError(field, SessionFieldErrorKey.NEW_PASSWORD_REQUIRED, 'New password is required'),
    ];
  if (utf8ByteLength(value) > PASSWORD_MAX_UTF8_BYTES)
    return [
      fieldError(
        field,
        SessionFieldErrorKey.NEW_PASSWORD_TOO_LONG,
        `New password must be at most ${PASSWORD_MAX_UTF8_BYTES} bytes in UTF-8`,
      ),
    ];
  if (characterCount(value) < PASSWORD_MIN_CHARACTERS)
    return [
      fieldError(
        field,
        SessionFieldErrorKey.NEW_PASSWORD_TOO_SHORT,
        `New password must be at least ${PASSWORD_MIN_CHARACTERS} characters`,
      ),
    ];
  return [];
}

export function fieldError(field: string, errorKey: string, message: string): V1FieldError {
  return { field, errorKey, message };
}

/**
 * Che IP cho `Session.ipMasked`: IPv4 giữ 2 octet đầu (`10.20.x.x`), IPv6 giữ 3 nhóm đầu (`2001:db8:1::x`).
 * R2 không quy định định dạng che (Q-I02-05); IP không hợp lệ/thiếu ⇒ `undefined` (field tuỳ chọn).
 */
export function maskIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.');
    return `${a}.${b}.x.x`;
  }
  if (version === 6) {
    const groups = ip.split(':').filter((group) => group.length > 0);
    return `${groups.slice(0, 3).join(':')}::x`;
  }
  return undefined;
}

/** Thông tin client do Gateway chuyển qua metadata (đã qua mTLS). */
export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/**
 * Chuẩn hoá thông tin client trước khi lưu: IP phải là địa chỉ IPv4/IPv6 hợp lệ (không thì bỏ),
 * user-agent cắt còn 500 ký tự (OpenAPI `Session.userAgent.maxLength`). Không bao giờ ném lỗi —
 * thiếu/sai thông tin client không chặn đăng nhập.
 */
export function normalizeClientInfo(input: ClientInfo): ClientInfo {
  const info: ClientInfo = {};
  if (input.ip && input.ip.length <= IP_ADDRESS_MAX_LENGTH && isIP(input.ip)) info.ip = input.ip;
  if (input.userAgent) info.userAgent = input.userAgent.slice(0, USER_AGENT_MAX_LENGTH);
  return info;
}
