import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { RedisService } from 'src/redis/redis.service';
import { RefreshTokenService, SessionRecord } from './refresh-token.service';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  const multi = {
    setex: jest.fn().mockReturnThis(),
    sadd: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  const client = {
    multi: jest.fn(() => multi),
    get: jest.fn(),
    mget: jest.fn(),
    smembers: jest.fn(),
    srem: jest.fn(),
    del: jest.fn(),
    ttl: jest.fn(),
    eval: jest.fn(),
  };

  const config: Record<string, string> = {
    REFRESHABLE_DURATION: '2592000',
    REFRESH_TOKEN_ABSOLUTE_DURATION: '7776000',
    REFRESH_TOKEN_GRACE_PERIOD: '10',
    MAX_ACTIVE_SESSIONS: '10',
  };

  const USER_ID = 'user-1';
  const SID = 'session-1';
  const now = new Date('2026-09-04T10:00:00.000Z');

  const buildSession = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
    sessionId: SID,
    currentJti: '1757000000000-aaaaaaaa',
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    absoluteExpiresAt: new Date(now.getTime() + 7776000 * 1000).toISOString(),
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    client.smembers.mockResolvedValue([]);
    client.mget.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: RedisService, useValue: { getClient: () => client } },
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn(), warn: jest.fn() } },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('issues a jti carrying the issue time plus random entropy', async () => {
      const result = await service.createSession(USER_ID, { ipAddress: '1.2.3.4' }, now);

      expect(result.jti).toMatch(/^\d+-[0-9a-f]{8}$/);
      expect(result.jti.split('-')[0]).toBe(`${now.getTime()}`);
      expect(result.ttlSeconds).toBe(2592000);
    });

    it('caps the sliding ttl by the absolute session lifetime', async () => {
      const shortLived = { ...config, REFRESH_TOKEN_ABSOLUTE_DURATION: '3600' };
      const module = await Test.createTestingModule({
        providers: [
          RefreshTokenService,
          { provide: RedisService, useValue: { getClient: () => client } },
          { provide: ConfigService, useValue: { get: (key: string) => shortLived[key] } },
          { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn(), warn: jest.fn() } },
        ],
      }).compile();

      const result = await module
        .get<RefreshTokenService>(RefreshTokenService)
        .createSession(USER_ID, {}, now);

      expect(result.ttlSeconds).toBe(3600);
    });

    it('truncates an oversized user agent', async () => {
      await service.createSession(USER_ID, { userAgent: 'x'.repeat(1000) }, now);

      const sessionJson = multi.setex.mock.calls[1][2] as string;
      expect((JSON.parse(sessionJson) as SessionRecord).userAgent).toHaveLength(512);
    });
  });

  describe('rotate', () => {
    it('returns not_found when the token carries no session id', async () => {
      const outcome = await service.rotate(USER_ID, 'old-jti', undefined, {}, now);

      expect(outcome).toEqual({ status: 'not_found' });
      expect(client.eval).not.toHaveBeenCalled();
    });

    it('returns revoked when the session no longer exists', async () => {
      client.get.mockResolvedValue(null);

      const outcome = await service.rotate(USER_ID, 'old-jti', SID, {}, now);

      expect(outcome).toEqual({ status: 'revoked' });
      expect(client.eval).not.toHaveBeenCalled();
    });

    it('returns session_expired once the absolute lifetime is reached', async () => {
      client.get.mockResolvedValue(
        JSON.stringify(buildSession({ absoluteExpiresAt: now.toISOString() })),
      );
      client.eval.mockResolvedValue(1);

      const outcome = await service.rotate(USER_ID, 'old-jti', SID, {}, now);

      expect(outcome).toEqual({ status: 'session_expired' });
    });

    it('rotates to a fresh jti while keeping the session id', async () => {
      client.get.mockResolvedValue(JSON.stringify(buildSession()));
      client.eval.mockResolvedValue(['ROTATED']);

      const outcome = await service.rotate(USER_ID, 'old-jti', SID, {}, now);

      expect(outcome).toMatchObject({ status: 'rotated', sessionId: SID, ttlSeconds: 2592000 });
      expect(outcome).toHaveProperty('jti');
      if (outcome.status === 'rotated') expect(outcome.jti).not.toBe('old-jti');
    });

    it('replays the already-issued token inside the grace window without writing', async () => {
      client.get.mockResolvedValue(JSON.stringify(buildSession()));
      client.eval.mockResolvedValue(['GRACE', `GRACE:${SID}:1757000000001-bbbbbbbb`]);
      client.ttl.mockResolvedValue(2591990);

      const outcome = await service.rotate(USER_ID, 'old-jti', SID, {}, now);

      expect(outcome).toEqual({
        status: 'grace',
        sessionId: SID,
        jti: '1757000000001-bbbbbbbb',
        // exp phải lấy từ TTL còn lại của key, không phải REFRESHABLE_DURATION
        ttlSeconds: 2591990,
      });
      expect(client.eval).toHaveBeenCalledTimes(1);
    });

    it('flags reuse and revokes the session when the token key is gone but the session lives', async () => {
      client.get.mockResolvedValue(JSON.stringify(buildSession()));
      client.eval.mockResolvedValueOnce(['MISS']).mockResolvedValueOnce(1);

      const outcome = await service.rotate(USER_ID, 'stale-jti', SID, {}, now);

      expect(outcome).toEqual({ status: 'reused' });
      // lệnh eval thứ 2 là script thu hồi phiên
      expect(client.eval).toHaveBeenCalledTimes(2);
    });
  });

  describe('listActiveSessions', () => {
    it('prunes index members whose session key has already expired', async () => {
      client.smembers.mockResolvedValue(['alive', 'dead']);
      client.mget.mockResolvedValue([JSON.stringify(buildSession({ sessionId: 'alive' })), null]);

      const sessions = await service.listActiveSessions(USER_ID);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('alive');
      expect(client.srem).toHaveBeenCalledWith(`REFRESH_INDEX_${USER_ID}`, 'dead');
    });

    it('returns an empty list without touching redis further', async () => {
      client.smembers.mockResolvedValue([]);

      expect(await service.listActiveSessions(USER_ID)).toEqual([]);
      expect(client.mget).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('revokes every session of a user and drops the index', async () => {
      client.smembers.mockResolvedValue(['s1', 's2']);
      client.eval.mockResolvedValue(1);

      expect(await service.revokeAllForUser(USER_ID)).toBe(2);
      expect(client.del).toHaveBeenCalledWith(`REFRESH_INDEX_${USER_ID}`);
    });

    it('is idempotent when the session is already gone', async () => {
      client.eval.mockResolvedValue(0);

      expect(await service.revokeSession(USER_ID, SID)).toBe(0);
    });
  });
});
