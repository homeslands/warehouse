import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Phần Gateway của refresh cookie + CSRF + Origin (W02 I-02/I-02b; business-rules §21, D14 mục 1, OpenAPI
 * `RefreshCookie` = cookie `wh_refresh`; ở HTTPS dùng tên có tiền tố — xem `CookieProfile`). Không cần dependency mới: cookie đọc thủ công từ header `Cookie`
 * (không dùng `cookie-parser`), CSRF là HMAC của Node `crypto`.
 *
 * Gateway HTTP v1 (controller + đặt cookie trên response) làm ở I-02b; file này là primitive đã test.
 */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
const CSRF_COOKIE_PATH = '/';
/** Giá trị cookie hợp lệ = token base64url 43 ký tự (refresh token, CSRF HMAC). */
const COOKIE_TOKEN_VALUE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Tên cookie theo chế độ Secure (review I-02b L2 — chống cookie tossing từ subdomain cùng site):
 * - Secure (mọi môi trường HTTPS): refresh `__Secure-wh_refresh` (giữ `Path=/api/v1/auth` của R2 — `__Host-`
 *   bắt buộc `Path=/` nên không dùng được cho refresh; lệch tên `wh_refresh` của OpenAPI, DEV-197-20), CSRF
 *   `__Host-wh_csrf` (host-only, `Path=/`, không có `Domain`: subdomain KHÔNG đặt được cookie này).
 *   Cookie không tiền tố (`wh_refresh`) do subdomain/HTTP đặt bị bỏ qua hoàn toàn.
 * - Không Secure (chỉ localhost HTTP dev/test, `GATEWAY_COOKIE_SECURE=false`): `wh_refresh` / `wh_csrf` —
 *   trình duyệt từ chối cookie có tiền tố nếu thiếu `Secure`.
 */
export interface CookieProfile {
  secure: boolean;
  refreshName: string;
  csrfName: string;
}

export const SECURE_COOKIE_PROFILE: CookieProfile = {
  secure: true,
  refreshName: '__Secure-wh_refresh',
  csrfName: '__Host-wh_csrf',
};
export const INSECURE_DEV_COOKIE_PROFILE: CookieProfile = {
  secure: false,
  refreshName: 'wh_refresh',
  csrfName: 'wh_csrf',
};

export function cookieProfile(secure: boolean): CookieProfile {
  return secure ? SECURE_COOKIE_PROFILE : INSECURE_DEV_COOKIE_PROFILE;
}

const PREFIXED = /^__(Secure|Host)-/;

/** Fail-closed: Secure ⇒ cả 2 tên phải có tiền tố (CSRF phải `__Host-`); không Secure ⇒ không tiền tố. */
export function assertCookieProfile(profile: CookieProfile): void {
  const refreshPrefixed = PREFIXED.test(profile.refreshName);
  const csrfHostOnly = profile.csrfName.startsWith('__Host-');
  if (profile.secure && (!refreshPrefixed || !csrfHostOnly))
    throw new RangeError('secure cookies must use __Secure-/__Host- prefixed names');
  if (!profile.secure && (refreshPrefixed || PREFIXED.test(profile.csrfName)))
    throw new RangeError('prefixed cookie names require Secure');
}

export interface CookieOptions {
  /** Giây còn lại tới `expiresAt` của phiên (Max-Age). */
  maxAgeSeconds: number;
}

function assertMaxAge(maxAgeSeconds: number): void {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0)
    throw new RangeError('maxAgeSeconds must be a non-negative integer');
}

/** `Set-Cookie` refresh: HttpOnly; SameSite=Lax; Path=/api/v1/auth; Secure (business-rules §21). */
export function buildRefreshCookie(
  token: string,
  options: CookieOptions,
  profile: CookieProfile,
): string {
  assertCookieProfile(profile);
  if (!COOKIE_TOKEN_VALUE.test(token)) throw new RangeError('refresh token has an invalid format');
  assertMaxAge(options.maxAgeSeconds);
  return serializeNamedCookie(profile.refreshName, token, {
    path: REFRESH_COOKIE_PATH,
    maxAgeSeconds: options.maxAgeSeconds,
    secure: profile.secure,
    httpOnly: true,
  });
}

/**
 * Cookie CSRF đọc được bằng JS (DEV-197-08: FE lấy lại `csrfToken` sau reload). KHÔNG `HttpOnly` có chủ đích;
 * giá trị là HMAC gắn với refresh cookie hiện hành (signed double-submit). Gateway KHÔNG so header với cookie
 * này, chỉ so với HMAC của refresh cookie. Ở chế độ Secure là `__Host-wh_csrf`: subdomain không đặt được, nên
 * FE chỉ đọc CSRF do chính host này phát.
 */
export function buildCsrfCookie(
  csrfToken: string,
  options: CookieOptions,
  profile: CookieProfile,
): string {
  assertCookieProfile(profile);
  if (!COOKIE_TOKEN_VALUE.test(csrfToken)) throw new RangeError('CSRF token has an invalid format');
  assertMaxAge(options.maxAgeSeconds);
  return serializeNamedCookie(profile.csrfName, csrfToken, {
    path: CSRF_COOKIE_PATH,
    maxAgeSeconds: options.maxAgeSeconds,
    secure: profile.secure,
    httpOnly: false,
  });
}

/**
 * `Set-Cookie` xoá mọi biến thể host-only mà Gateway có thể xoá: cookie của profile hiện tại, và ở chế độ Secure
 * cả tên không tiền tố (cookie cũ/HTTP). Cookie `Domain=<parent>` do subdomain đặt KHÔNG xoá được từ host này
 * (Gateway không biết domain cha) — rủi ro DoS còn lại ghi ở DEV-197-08.
 */
export function buildClearedCookies(profile: CookieProfile): string[] {
  assertCookieProfile(profile);
  const clear = (name: string, path: string, httpOnly: boolean, secure: boolean) =>
    serializeNamedCookie(name, '', { path, maxAgeSeconds: 0, secure, httpOnly });
  const cookies = [
    clear(profile.refreshName, REFRESH_COOKIE_PATH, true, profile.secure),
    clear(profile.csrfName, CSRF_COOKIE_PATH, false, profile.secure),
  ];
  if (profile.secure)
    cookies.push(
      clear(INSECURE_DEV_COOKIE_PROFILE.refreshName, REFRESH_COOKIE_PATH, true, true),
      clear(INSECURE_DEV_COOKIE_PROFILE.csrfName, CSRF_COOKIE_PATH, false, true),
    );
  return cookies;
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

export type RefreshCookieRead =
  | { status: 'ok'; token: string }
  | { status: 'missing' }
  /** Nhiều cookie cùng tên (cookie tossing / Domain khác) hoặc giá trị sai định dạng. */
  | { status: 'conflict' };

/**
 * Đọc refresh token từ header `Cookie` (RFC 6265 `name=value; name=value`) theo đúng tên của profile; tên khác
 * (vd `wh_refresh` không tiền tố khi Secure) bị bỏ qua. Nhiều giá trị cùng tên ⇒ `conflict` (không đoán cái nào
 * đúng). Không decode %-encoding; không ném lỗi.
 */
export function readRefreshCookie(
  cookieHeader: string | string[] | undefined,
  profile: CookieProfile,
): RefreshCookieRead {
  if (cookieHeader === undefined) return { status: 'missing' };
  const header = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  const values: string[] = [];
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === profile.refreshName)
      values.push(pair.slice(separator + 1).trim());
  }
  if (values.length === 0) return { status: 'missing' };
  if (values.length > 1 || !COOKIE_TOKEN_VALUE.test(values[0])) return { status: 'conflict' };
  return { status: 'ok', token: values[0] };
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
