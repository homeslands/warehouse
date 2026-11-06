import {
  ACCESS_TOKEN_TTL_SECONDS,
  PASSWORD_MAX_UTF8_BYTES,
  SESSION_IDLE_TIMEOUT_MS,
} from './session.constants';
import {
  decideRefresh,
  generateRefreshToken,
  hashRefreshToken,
  isWellFormedRefreshToken,
  maskIp,
  newPasswordErrors,
  nextIdleExpiry,
  normalizeClientInfo,
  RefreshCandidate,
  sessionUnusableReason,
  SessionState,
} from './session.policy';
import { SessionFieldErrorKey, SessionValidation } from './session.validation';

const T0 = new Date('2026-11-06T03:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const MINUTE = 60_000;

function activeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    revokedAt: null,
    lockedAt: null,
    idleExpiresAt: at(SESSION_IDLE_TIMEOUT_MS),
    expiresAt: at(7 * 24 * 60 * MINUTE),
    ...overrides,
  };
}

function candidate(overrides: Partial<RefreshCandidate> = {}): RefreshCandidate {
  return {
    session: activeSession(),
    family: { revokedAt: null },
    hash: { usedAt: null, currentFamilyId: 'family-1', expiresAt: at(7 * 24 * 60 * MINUTE) },
    userActive: true,
    ...overrides,
  };
}

describe('session policy (W02 I-02, clock injected — no real sleep)', () => {
  it('uses the R2 durations: access 15 minutes, idle 30 minutes', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(30 * MINUTE);
  });

  describe('sessionUnusableReason', () => {
    it('accepts a session 1 ms before the idle deadline and rejects it exactly at the deadline', () => {
      const session = activeSession();
      expect(sessionUnusableReason(session, at(30 * MINUTE - 1))).toBeUndefined();
      expect(sessionUnusableReason(session, at(30 * MINUTE))).toBe(
        SessionValidation.SESSION_IDLE_EXPIRED,
      );
    });

    it('reports revoked before locked before expired before idle', () => {
      const late = at(8 * 24 * 60 * MINUTE);
      expect(sessionUnusableReason(activeSession({ revokedAt: T0, lockedAt: T0 }), late)).toBe(
        SessionValidation.SESSION_REVOKED,
      );
      expect(sessionUnusableReason(activeSession({ lockedAt: T0 }), late)).toBe(
        SessionValidation.SESSION_LOCKED,
      );
      expect(sessionUnusableReason(activeSession(), late)).toBe(SessionValidation.SESSION_EXPIRED);
    });
  });

  it('nextIdleExpiry extends 30 minutes from the interaction but never past the absolute expiry', () => {
    expect(nextIdleExpiry(at(5 * MINUTE), at(7 * 24 * 60 * MINUTE))).toEqual(at(35 * MINUTE));
    expect(nextIdleExpiry(at(5 * MINUTE), at(10 * MINUTE))).toEqual(at(10 * MINUTE));
  });

  describe('decideRefresh', () => {
    it('rotates a current token of a usable session', () => {
      expect(decideRefresh(candidate(), at(29 * MINUTE))).toEqual({ action: 'rotate' });
    });

    it('treats a used token as reuse — even when the session is already idle or revoked', () => {
      const used = { usedAt: T0, currentFamilyId: null, expiresAt: at(60 * MINUTE) };
      expect(decideRefresh(candidate({ hash: used }), at(MINUTE))).toEqual({
        action: 'revoke-reuse',
      });
      expect(
        decideRefresh(
          candidate({ hash: used, session: activeSession({ revokedAt: T0 }) }),
          at(45 * MINUTE),
        ),
      ).toEqual({ action: 'revoke-reuse' });
    });

    it('rejects refresh on an idle session without rotating (TC-AUTH-03: refresh does not extend idle)', () => {
      expect(decideRefresh(candidate(), at(30 * MINUTE))).toEqual({
        action: 'reject',
        error: SessionValidation.SESSION_IDLE_EXPIRED,
      });
    });

    it('rejects revoked family, locked session, expired token and inactive user', () => {
      const now = at(MINUTE);
      expect(decideRefresh(candidate({ family: { revokedAt: T0 } }), now)).toMatchObject({
        error: SessionValidation.SESSION_REVOKED,
      });
      expect(
        decideRefresh(candidate({ session: activeSession({ lockedAt: T0 }) }), now),
      ).toMatchObject({ error: SessionValidation.SESSION_LOCKED });
      expect(
        decideRefresh(
          candidate({ hash: { usedAt: null, currentFamilyId: 'f', expiresAt: now } }),
          now,
        ),
      ).toMatchObject({ error: SessionValidation.SESSION_EXPIRED });
      expect(decideRefresh(candidate({ userActive: false }), now)).toMatchObject({
        error: SessionValidation.SESSION_USER_INACTIVE,
      });
    });
  });

  describe('refresh token', () => {
    it('is 43 base64url characters, random, and only its SHA-256 hex is stored', () => {
      const first = generateRefreshToken();
      const second = generateRefreshToken();
      expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(first).not.toBe(second);
      expect(isWellFormedRefreshToken(first)).toBe(true);
      const hash = hashRefreshToken(first);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toContain(first);
    });

    it('rejects malformed tokens', () => {
      for (const value of [
        undefined,
        '',
        'short',
        `${generateRefreshToken()}x`,
        'a'.repeat(42) + '=',
        42,
      ])
        expect(isWellFormedRefreshToken(value)).toBe(false);
    });
  });

  describe('newPasswordErrors (business-rules §16: 12 characters .. 72 UTF-8 bytes)', () => {
    const keys = (value: unknown) => newPasswordErrors('newPassword', value).map((e) => e.errorKey);

    it('accepts exactly 12 characters and exactly 72 bytes', () => {
      expect(keys('a'.repeat(12))).toEqual([]);
      expect(keys('a'.repeat(PASSWORD_MAX_UTF8_BYTES))).toEqual([]);
      // 36 × "é" (2 byte) = 72 byte.
      expect(keys('é'.repeat(36))).toEqual([]);
    });

    it('rejects 11 characters and 73 bytes, counting UTF-8 bytes rather than characters', () => {
      expect(keys('a'.repeat(11))).toEqual([SessionFieldErrorKey.NEW_PASSWORD_TOO_SHORT]);
      expect(keys('a'.repeat(73))).toEqual([SessionFieldErrorKey.NEW_PASSWORD_TOO_LONG]);
      // 37 ký tự nhưng 74 byte: không được để bcrypt cắt ngầm.
      expect(keys('é'.repeat(37))).toEqual([SessionFieldErrorKey.NEW_PASSWORD_TOO_LONG]);
      // 19 emoji = 76 byte.
      expect(keys('😀'.repeat(19))).toEqual([SessionFieldErrorKey.NEW_PASSWORD_TOO_LONG]);
    });

    it('counts characters by code point (12 emoji = 12 characters, 48 bytes)', () => {
      expect(keys('😀'.repeat(12))).toEqual([]);
      expect(keys('😀'.repeat(11))).toEqual([SessionFieldErrorKey.NEW_PASSWORD_TOO_SHORT]);
    });

    it('requires a string', () => {
      expect(keys(undefined)).toEqual([SessionFieldErrorKey.NEW_PASSWORD_REQUIRED]);
      expect(keys('')).toEqual([SessionFieldErrorKey.NEW_PASSWORD_REQUIRED]);
      expect(keys(123456789012)).toEqual([SessionFieldErrorKey.NEW_PASSWORD_REQUIRED]);
    });
  });

  it('masks IPv4/IPv6 and drops invalid IPs', () => {
    expect(maskIp('192.168.10.20')).toBe('192.168.x.x');
    expect(maskIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::x');
    expect(maskIp('not-an-ip')).toBeUndefined();
    expect(maskIp(null)).toBeUndefined();
  });

  it('normalizes client info: invalid IP dropped, user agent capped at 500 characters', () => {
    expect(normalizeClientInfo({ ip: '1.2.3.4', userAgent: 'x'.repeat(600) })).toEqual({
      ip: '1.2.3.4',
      userAgent: 'x'.repeat(500),
    });
    expect(normalizeClientInfo({ ip: "1.2.3.4' OR 1=1" })).toEqual({});
  });
});
