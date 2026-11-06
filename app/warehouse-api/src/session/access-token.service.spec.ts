import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { AccessTokenService } from './access-token.service';
import { SessionException } from './session.exception';
import { Clock } from './session.policy';
import { SessionValidation } from './session.validation';

const SECRET = 'a'.repeat(48);

class ManualClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

function errorOf(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SessionException);
    return (error as SessionException).error;
  }
  throw new Error('expected SessionException');
}

describe('AccessTokenService (v1 access JWT, 15 minutes)', () => {
  const claims = { sub: uuidv4(), sid: uuidv4() };
  let clock: ManualClock;
  let service: AccessTokenService;

  beforeEach(() => {
    clock = new ManualClock(new Date('2026-11-06T03:00:00.000Z'));
    service = new AccessTokenService(SECRET, clock);
  });

  it('signs and verifies sub/sid; expiresAt = now + 900 s', () => {
    const issued = service.sign(claims);
    expect(issued.expiresAt.toISOString()).toBe('2026-11-06T03:15:00.000Z');
    expect(service.verify(issued.token)).toEqual(claims);
  });

  it('expires at 900 s (injected clock, no sleep)', () => {
    const { token } = service.sign(claims);
    clock.advance(899_000);
    expect(service.verify(token)).toEqual(claims);
    clock.advance(1_000);
    expect(errorOf(() => service.verify(token))).toBe(
      SessionValidation.SESSION_ACCESS_TOKEN_EXPIRED,
    );
  });

  it('rejects tokens signed with another secret (e.g. legacy JWT_SECRET)', () => {
    const other = new AccessTokenService('b'.repeat(48), clock);
    expect(errorOf(() => service.verify(other.sign(claims).token))).toBe(
      SessionValidation.SESSION_ACCESS_TOKEN_INVALID,
    );
  });

  it('rejects a legacy-shaped token, wrong audience/issuer, alg none and garbage', () => {
    const raw = new JwtService({ secret: SECRET });
    const iat = Math.floor(clock.now().getTime() / 1000);
    const legacy = raw.sign({
      sub: claims.sub,
      sid: claims.sid,
      type: 'access',
      iat,
      exp: iat + 60,
    });
    const wrongAudience = raw.sign(
      { ...claims, typ: 'wh-v1-access', jti: uuidv4(), iat, exp: iat + 60 },
      { issuer: 'warehouse-storage', audience: 'someone-else' },
    );
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        ...claims,
        typ: 'wh-v1-access',
        iss: 'warehouse-storage',
        aud: 'warehouse-api-v1',
        exp: iat + 60,
      }),
    ).toString('base64url');
    for (const token of [legacy, wrongAudience, `${header}.${payload}.`, 'not-a-jwt'])
      expect(errorOf(() => service.verify(token))).toBe(
        SessionValidation.SESSION_ACCESS_TOKEN_INVALID,
      );
  });

  it('rejects a weak secret at construction', () => {
    expect(() => new AccessTokenService('short', clock)).toThrow(RangeError);
  });
});
