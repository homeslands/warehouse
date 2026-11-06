import {
  assertCookieProfile,
  buildClearedCookies,
  buildCsrfCookie,
  buildRefreshCookie,
  cookieProfile,
  deriveCsrfToken,
  INSECURE_DEV_COOKIE_PROFILE,
  isValidCsrfToken,
  OriginAllowlist,
  readRefreshCookie,
  SECURE_COOKIE_PROFILE,
} from './refresh-cookie';

const TOKEN = 'A'.repeat(21) + '_' + 'b'.repeat(20) + '-';
const OTHER = 'C'.repeat(43);
const SECRET = 's'.repeat(40);
const SECURE = SECURE_COOKIE_PROFILE;

describe('Gateway refresh cookie / CSRF / Origin primitives (W02 I-02, I-02b L2)', () => {
  it('builds prefixed cookies when Secure: __Secure-wh_refresh (Path=/api/v1/auth) and __Host-wh_csrf', () => {
    expect(buildRefreshCookie(TOKEN, { maxAgeSeconds: 604800 }, SECURE)).toBe(
      `__Secure-wh_refresh=${TOKEN}; Path=/api/v1/auth; Max-Age=604800; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(buildCsrfCookie(OTHER, { maxAgeSeconds: 10 }, SECURE)).toBe(
      `__Host-wh_csrf=${OTHER}; Path=/; Max-Age=10; SameSite=Lax; Secure`,
    );
    expect(() => buildRefreshCookie('bad;value', { maxAgeSeconds: 1 }, SECURE)).toThrow(RangeError);
    expect(() => buildRefreshCookie(TOKEN, { maxAgeSeconds: -1 }, SECURE)).toThrow(RangeError);
    expect(() => buildCsrfCookie('bad;x', { maxAgeSeconds: 1 }, SECURE)).toThrow(RangeError);
  });

  it('uses unprefixed names only for the explicit insecure dev profile', () => {
    expect(cookieProfile(false)).toBe(INSECURE_DEV_COOKIE_PROFILE);
    expect(cookieProfile(true)).toBe(SECURE);
    expect(buildRefreshCookie(TOKEN, { maxAgeSeconds: 1 }, INSECURE_DEV_COOKIE_PROFILE)).toBe(
      `wh_refresh=${TOKEN}; Path=/api/v1/auth; Max-Age=1; HttpOnly; SameSite=Lax`,
    );
  });

  it('fails closed on a mismatched profile (Secure without prefix, prefix without Secure)', () => {
    for (const profile of [
      { secure: true, refreshName: 'wh_refresh', csrfName: '__Host-wh_csrf' },
      { secure: true, refreshName: '__Secure-wh_refresh', csrfName: '__Secure-wh_csrf' },
      { secure: true, refreshName: '__Secure-wh_refresh', csrfName: 'wh_csrf' },
      { secure: false, refreshName: '__Secure-wh_refresh', csrfName: 'wh_csrf' },
      { secure: false, refreshName: 'wh_refresh', csrfName: '__Host-wh_csrf' },
    ]) {
      expect(() => assertCookieProfile(profile)).toThrow(RangeError);
      expect(() => buildRefreshCookie(TOKEN, { maxAgeSeconds: 1 }, profile)).toThrow(RangeError);
    }
  });

  it('clears every host-only variant it can (prefixed + legacy unprefixed)', () => {
    expect(buildClearedCookies(SECURE)).toEqual([
      '__Secure-wh_refresh=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
      '__Host-wh_csrf=; Path=/; Max-Age=0; SameSite=Lax; Secure',
      'wh_refresh=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
      'wh_csrf=; Path=/; Max-Age=0; SameSite=Lax; Secure',
    ]);
    expect(buildClearedCookies(INSECURE_DEV_COOKIE_PROFILE)).toHaveLength(2);
  });

  it('reads exactly one well-formed cookie of the profile name; tossing ⇒ conflict, other names ignored', () => {
    expect(readRefreshCookie(`a=1; __Secure-wh_refresh=${TOKEN}; b=2`, SECURE)).toEqual({
      status: 'ok',
      token: TOKEN,
    });
    expect(readRefreshCookie(undefined, SECURE)).toEqual({ status: 'missing' });
    // Cookie không tiền tố (subdomain/HTTP đặt) bị bỏ qua khi Secure.
    expect(readRefreshCookie(`wh_refresh=${TOKEN}`, SECURE)).toEqual({ status: 'missing' });
    expect(readRefreshCookie(`wh_refresh=${OTHER}; __Secure-wh_refresh=${TOKEN}`, SECURE)).toEqual({
      status: 'ok',
      token: TOKEN,
    });
    // 2 cookie cùng tên (vd 1 host-only + 1 Domain=parent) ⇒ không đoán.
    expect(
      readRefreshCookie(`__Secure-wh_refresh=${TOKEN}; __Secure-wh_refresh=${OTHER}`, SECURE),
    ).toEqual({ status: 'conflict' });
    expect(readRefreshCookie('__Secure-wh_refresh=short', SECURE)).toEqual({ status: 'conflict' });
    expect(readRefreshCookie(['x=1', `__Secure-wh_refresh=${TOKEN}`], SECURE)).toEqual({
      status: 'ok',
      token: TOKEN,
    });
    expect(readRefreshCookie(`x__Secure-wh_refresh=${TOKEN}`, SECURE)).toEqual({
      status: 'missing',
    });
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
