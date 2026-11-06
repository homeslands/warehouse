import {
  buildClearedRefreshCookie,
  buildRefreshCookie,
  deriveCsrfToken,
  isValidCsrfToken,
  OriginAllowlist,
  readRefreshCookie,
  REFRESH_COOKIE_NAME,
} from './refresh-cookie';

const TOKEN = 'A'.repeat(21) + '_' + 'b'.repeat(20) + '-';
const OTHER = 'C'.repeat(43);
const SECRET = 's'.repeat(40);

describe('Gateway refresh cookie / CSRF / Origin primitives (W02 I-02)', () => {
  it('builds the R2 cookie: HttpOnly, Secure, SameSite=Lax, Path=/api/v1/auth', () => {
    const cookie = buildRefreshCookie(TOKEN, { maxAgeSeconds: 604800, secure: true });
    expect(cookie).toBe(
      `wh_refresh=${TOKEN}; Path=/api/v1/auth; Max-Age=604800; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(buildClearedRefreshCookie(true)).toBe(
      'wh_refresh=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
    );
    expect(() => buildRefreshCookie('bad;value', { maxAgeSeconds: 1, secure: true })).toThrow(
      RangeError,
    );
    expect(() => buildRefreshCookie(TOKEN, { maxAgeSeconds: -1, secure: true })).toThrow(
      RangeError,
    );
  });

  it('reads exactly one well-formed wh_refresh cookie', () => {
    expect(readRefreshCookie(`a=1; ${REFRESH_COOKIE_NAME}=${TOKEN}; b=2`)).toBe(TOKEN);
    expect(readRefreshCookie(undefined)).toBeUndefined();
    expect(readRefreshCookie('a=1')).toBeUndefined();
    // Cookie tossing: 2 giá trị ⇒ không chọn.
    expect(readRefreshCookie(`wh_refresh=${TOKEN}; wh_refresh=${OTHER}`)).toBeUndefined();
    expect(readRefreshCookie(['x=1', `wh_refresh=${TOKEN}`])).toBe(TOKEN);
    expect(readRefreshCookie('wh_refresh=short')).toBeUndefined();
    expect(readRefreshCookie(`xwh_refresh=${TOKEN}`)).toBeUndefined();
  });

  it('derives a CSRF token bound to the refresh token and compares it safely', () => {
    const csrf = deriveCsrfToken(SECRET, TOKEN);
    expect(csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrf.length).toBeGreaterThanOrEqual(16);
    expect(isValidCsrfToken(SECRET, TOKEN, csrf)).toBe(true);
    expect(isValidCsrfToken(SECRET, OTHER, csrf)).toBe(false);
    expect(isValidCsrfToken('t'.repeat(40), TOKEN, csrf)).toBe(false);
    expect(isValidCsrfToken(SECRET, TOKEN, undefined)).toBe(false);
    expect(isValidCsrfToken(SECRET, TOKEN, [csrf, csrf])).toBe(false);
    expect(isValidCsrfToken(SECRET, TOKEN, csrf.slice(1))).toBe(false);
    expect(() => deriveCsrfToken('short', TOKEN)).toThrow(RangeError);
  });

  it('allows only exact allowlisted origins', () => {
    const allowlist = new OriginAllowlist(['https://wh.example.vn', 'http://localhost:5173']);
    expect(allowlist.allows('https://wh.example.vn')).toBe(true);
    expect(allowlist.allows('HTTPS://WH.EXAMPLE.VN')).toBe(true);
    expect(allowlist.allows('http://localhost:5173')).toBe(true);
    for (const origin of [
      undefined,
      'null',
      'https://evil.example',
      'https://wh.example.vn.evil.example',
      'http://wh.example.vn',
      'https://wh.example.vn:8443',
      'not a url',
      ['https://wh.example.vn', 'https://wh.example.vn'],
    ])
      expect(allowlist.allows(origin)).toBe(false);
  });

  it('refuses wildcard, path or empty allowlist configuration', () => {
    expect(() => new OriginAllowlist([])).toThrow(RangeError);
    expect(() => new OriginAllowlist(['*'])).toThrow(RangeError);
    expect(() => new OriginAllowlist(['https://*.example.vn'])).toThrow(RangeError);
    expect(() => new OriginAllowlist(['https://wh.example.vn/app'])).toThrow(RangeError);
    expect(() => new OriginAllowlist(['https://wh.example.vn/'])).toThrow(RangeError);
    expect(() => new OriginAllowlist(['ftp://wh.example.vn'])).toThrow(RangeError);
  });
});
