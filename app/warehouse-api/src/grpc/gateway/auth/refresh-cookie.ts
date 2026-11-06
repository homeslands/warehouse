import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Phần Gateway của refresh cookie + CSRF + Origin (W02 I-02; business-rules §21, D14 mục 1, OpenAPI
 * `RefreshCookie` = cookie `wh_refresh`). Không cần dependency mới: cookie đọc thủ công từ header `Cookie`
 * (không dùng `cookie-parser`), CSRF là HMAC của Node `crypto`.
 *
 * Gateway HTTP v1 (controller + đặt cookie trên response) làm ở I-02b; file này là primitive đã test.
 */
export const REFRESH_COOKIE_NAME = 'wh_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
/** Giá trị cookie hợp lệ = refresh token base64url 43 ký tự (xem `generateRefreshToken`). */
const REFRESH_COOKIE_VALUE = /^[A-Za-z0-9_-]{43}$/;

export interface RefreshCookieOptions {
  /** Giây còn lại tới `expiresAt` của phiên (Max-Age). */
  maxAgeSeconds: number;
  /**
   * `Secure` bắt buộc ở mọi môi trường nghiệm thu (D14 mục 6: HTTPS). Chỉ tắt cho localhost HTTP test và phải
   * ghi ngoại lệ môi trường.
   */
  secure: boolean;
}

/** `Set-Cookie` cho refresh token: HttpOnly; SameSite=Lax; Path=/api/v1/auth; Secure (business-rules §21). */
export function buildRefreshCookie(token: string, options: RefreshCookieOptions): string {
  if (!REFRESH_COOKIE_VALUE.test(token))
    throw new RangeError('refresh token has an invalid format');
  if (!Number.isSafeInteger(options.maxAgeSeconds) || options.maxAgeSeconds < 0)
    throw new RangeError('maxAgeSeconds must be a non-negative integer');
  return serializeCookie(token, options.maxAgeSeconds, options.secure);
}

/** `Set-Cookie` xoá cookie (logout/logout-all/refresh lỗi 401). */
export function buildClearedRefreshCookie(secure: boolean): string {
  return serializeCookie('', 0, secure);
}

function serializeCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  return serializeNamedCookie(REFRESH_COOKIE_NAME, value, {
    path: REFRESH_COOKIE_PATH,
    maxAgeSeconds,
    secure,
    httpOnly: true,
  });
}

/**
 * Đọc refresh token từ header `Cookie` (RFC 6265 `name=value; name=value`). Trả `undefined` nếu:
 * - không có cookie `wh_refresh`;
 * - có NHIỀU hơn 1 cookie `wh_refresh` (cookie tossing từ subdomain/path khác — không đoán cái nào đúng);
 * - giá trị không đúng định dạng refresh token.
 * Không decode %-encoding (token base64url không cần); không ném lỗi.
 */
export function readRefreshCookie(cookieHeader: string | string[] | undefined): string | undefined {
  if (cookieHeader === undefined) return undefined;
  const header = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  const values: string[] = [];
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === REFRESH_COOKIE_NAME)
      values.push(pair.slice(separator + 1).trim());
  }
  if (values.length !== 1) return undefined;
  return REFRESH_COOKIE_VALUE.test(values[0]) ? values[0] : undefined;
}

/**
 * Cookie CSRF đọc được bằng JS (I-02b, DEV-197-08: FE lấy lại `csrfToken` sau reload). KHÔNG `HttpOnly` có
 * chủ đích; giá trị là HMAC gắn với refresh cookie hiện hành (signed double-submit) nên:
 * - origin khác không đọc được cookie của site ⇒ không dựng được header `X-CSRF-Token`;
 * - subdomain/MITM có ghi đè được cookie này cũng không tính được HMAC đúng cho refresh cookie (HttpOnly) ⇒
 *   Gateway vẫn từ chối (Gateway KHÔNG so header với cookie này, chỉ so với HMAC của refresh cookie).
 * `Path=/` để trang FE đọc được; `SameSite=Lax`, `Secure` như refresh cookie.
 */
export const CSRF_COOKIE_NAME = 'wh_csrf';
const CSRF_COOKIE_PATH = '/';
const CSRF_VALUE = /^[A-Za-z0-9_-]{43}$/;

export function buildCsrfCookie(csrfToken: string, options: RefreshCookieOptions): string {
  if (!CSRF_VALUE.test(csrfToken)) throw new RangeError('CSRF token has an invalid format');
  if (!Number.isSafeInteger(options.maxAgeSeconds) || options.maxAgeSeconds < 0)
    throw new RangeError('maxAgeSeconds must be a non-negative integer');
  return serializeNamedCookie(CSRF_COOKIE_NAME, csrfToken, {
    path: CSRF_COOKIE_PATH,
    maxAgeSeconds: options.maxAgeSeconds,
    secure: options.secure,
    httpOnly: false,
  });
}

export function buildClearedCsrfCookie(secure: boolean): string {
  return serializeNamedCookie(CSRF_COOKIE_NAME, '', {
    path: CSRF_COOKIE_PATH,
    maxAgeSeconds: 0,
    secure,
    httpOnly: false,
  });
}

interface CookieAttributes {
  path: string;
  maxAgeSeconds: number;
  secure: boolean;
  httpOnly: boolean;
}

function serializeNamedCookie(name: string, value: string, attributes: CookieAttributes): string {
  const parts = [
    `${name}=${value}`,
    `Path=${attributes.path}`,
    `Max-Age=${attributes.maxAgeSeconds}`,
  ];
  if (attributes.httpOnly) parts.push('HttpOnly');
  parts.push('SameSite=Lax');
  if (attributes.secure) parts.push('Secure');
  return parts.join('; ');
}

const CSRF_CONTEXT = 'wh-csrf-v1:';
/** Secret HMAC CSRF của Gateway, tối thiểu 32 ký tự. */
export const CSRF_SECRET_MIN_LENGTH = 32;

function assertCsrfSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length < CSRF_SECRET_MIN_LENGTH)
    throw new RangeError(`CSRF secret must be at least ${CSRF_SECRET_MIN_LENGTH} characters`);
}

/**
 * CSRF token gắn với refresh token hiện hành ("signed double-submit", DEV-197-08): HMAC-SHA256(secret,
 * refresh token), base64url 43 ký tự (OpenAPI `X-CSRF-Token` minLength 16). Mỗi lần rotate cookie thì CSRF
 * cũng đổi; trang khác origin không đọc được cookie HttpOnly nên không dựng được token.
 */
export function deriveCsrfToken(secret: string, refreshToken: string): string {
  assertCsrfSecret(secret);
  return createHmac('sha256', secret)
    .update(CSRF_CONTEXT + refreshToken, 'utf8')
    .digest('base64url');
}

/** So sánh hằng thời gian; header thiếu/sai độ dài ⇒ `false`. */
export function isValidCsrfToken(
  secret: string,
  refreshToken: string,
  header: string | string[] | undefined,
): boolean {
  if (typeof header !== 'string') return false;
  const expected = Buffer.from(deriveCsrfToken(secret, refreshToken), 'utf8');
  const received = Buffer.from(header, 'utf8');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Allowlist Origin cho endpoint dùng refresh cookie (business-rules §21: "Origin allowlist + CSRF ở refresh,
 * không wildcard CORS credentials"). Mỗi mục phải là origin chuẩn `scheme://host[:port]` (không path, không
 * `*`); so khớp chính xác sau khi chuẩn hoá bằng `URL`. Header thiếu/`null`/nhiều giá trị ⇒ từ chối.
 */
export class OriginAllowlist {
  private readonly origins: ReadonlySet<string>;

  constructor(entries: readonly string[]) {
    if (!entries.length) throw new RangeError('origin allowlist must not be empty');
    this.origins = new Set(entries.map(canonicalOrigin));
  }

  allows(header: string | string[] | undefined): boolean {
    if (typeof header !== 'string' || header === 'null') return false;
    let origin: string;
    try {
      origin = canonicalOrigin(header);
    } catch {
      // Origin không parse được ⇒ không thuộc allowlist (fail-closed), không ném ra ngoài.
      return false;
    }
    return this.origins.has(origin);
  }
}

function canonicalOrigin(value: string): string {
  if (value.includes('*')) throw new RangeError('wildcard origins are not allowed');
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new RangeError('origin must use http or https');
  const hasExtras =
    url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username || url.password;
  if (hasExtras || value.endsWith('/'))
    throw new RangeError('origin must not contain a path, query or credentials');
  return url.origin;
}
