import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from 'src/redis/redis.service';
import { BLACKLIST_PREFIX, IAT_AVAILABLE_PREFIX, REVOKED_FLAG_VALUE } from './auth.constants';
import { TokenRevocationService } from './token-revocation.service';

const USER_ID = 'user-id';
const SID = 'session-id';
const REFRESHABLE_DURATION = 2592000;

const blacklistKey = `${BLACKLIST_PREFIX}_${USER_ID}_${SID}`;
const iatAvailableKey = `${IAT_AVAILABLE_PREFIX}_${USER_ID}`;

describe('TokenRevocationService', () => {
  let service: TokenRevocationService;

  const client = {
    set: jest.fn(),
    get: jest.fn(),
    mget: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    client.get.mockResolvedValue(null);
    client.mget.mockResolvedValue([null, null]);
    client.set.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenRevocationService,
        { provide: RedisService, useValue: { getClient: () => client } },
        {
          provide: ConfigService,
          useValue: { get: () => `${REFRESHABLE_DURATION}` },
        },
      ],
    }).compile();

    service = module.get<TokenRevocationService>(TokenRevocationService);
  });

  // Ghim đúng chuỗi key đang chạy production. Các test còn lại dựng key từ chính constant nên
  // đổi prefix sẽ pass im lặng — trong khi đổi thật là breaking change: key thu hồi đã ghi trước
  // đó thành mồ côi, token của user đã logout sống lại. Đổi 2 dòng dưới phải là hành động có ý thức.
  describe('redis key format', () => {
    it('pins the wire format of both keys', () => {
      expect(blacklistKey).toBe('BLACK_LIST_user-id_session-id');
      expect(iatAvailableKey).toBe('TOKEN_IAT_AVAILABLE_user-id');
    });
  });

  describe('revokeSession', () => {
    it('blacklists the session for the full refresh lifetime', async () => {
      await service.revokeSession(USER_ID, SID);

      expect(client.set).toHaveBeenCalledWith(
        blacklistKey,
        REVOKED_FLAG_VALUE,
        'EX',
        REFRESHABLE_DURATION,
      );
    });

    // Logout im lặng không có tác dụng còn tệ hơn 5xx — thao tác idempotent nên client retry được.
    it('propagates a redis failure instead of silently succeeding', async () => {
      client.set.mockRejectedValue(new Error('redis down'));

      await expect(service.revokeSession(USER_ID, SID)).rejects.toThrow('redis down');
    });
  });

  describe('revokeAllTokensForUser', () => {
    it('writes the cutoff for the whole user and returns it', async () => {
      const before = Math.floor(Date.now() / 1000);

      const cutoff = await service.revokeAllTokensForUser(USER_ID);

      expect(cutoff).toBeGreaterThanOrEqual(before);
      expect(client.set).toHaveBeenCalledWith(
        iatAvailableKey,
        `${cutoff}`,
        'EX',
        REFRESHABLE_DURATION,
      );
    });
  });

  describe('isRevoked', () => {
    it('checks both keys in a single round trip', async () => {
      await service.isRevoked(USER_ID, SID, 1000);

      expect(client.mget).toHaveBeenCalledTimes(1);
      expect(client.mget).toHaveBeenCalledWith(blacklistKey, iatAvailableKey);
      expect(client.get).not.toHaveBeenCalled();
    });

    it('allows a token when neither key is set', async () => {
      await expect(service.isRevoked(USER_ID, SID, 1000)).resolves.toBe(false);
    });

    it('denies a token whose session was logged out', async () => {
      client.mget.mockResolvedValue(['1', null]);

      await expect(service.isRevoked(USER_ID, SID, 1000)).resolves.toBe(true);
    });

    it('denies a token issued before the cutoff', async () => {
      client.mget.mockResolvedValue([null, '1000']);

      await expect(service.isRevoked(USER_ID, SID, 999)).resolves.toBe(true);
    });

    it('allows a token issued after the cutoff', async () => {
      client.mget.mockResolvedValue([null, '1000']);

      await expect(service.isRevoked(USER_ID, SID, 1001)).resolves.toBe(false);
    });

    // Khe hở dưới 1 giây đã ghi trong spec: `iat` chỉ có độ phân giải giây, token ký cùng giây với
    // lần thu hồi lọt qua. Đổi lại, login lại ngay trong giây đó không tự giết token của chính nó.
    it('allows a token issued in the same second as the cutoff', async () => {
      client.mget.mockResolvedValue([null, '1000']);

      await expect(service.isRevoked(USER_ID, SID, 1000)).resolves.toBe(false);
    });

    it('falls back to the cutoff alone for a token with no sid', async () => {
      client.get.mockResolvedValue('1000');

      await expect(service.isRevoked(USER_ID, undefined, 999)).resolves.toBe(true);
      expect(client.get).toHaveBeenCalledWith(iatAvailableKey);
      expect(client.mget).not.toHaveBeenCalled();
    });

    // Fail-closed: thu hồi mà bypass được bằng cách làm Redis chết thì không phải cơ chế bảo mật.
    it('denies the request when redis is unreachable', async () => {
      client.mget.mockRejectedValue(new Error('redis down'));

      await expect(service.isRevoked(USER_ID, SID, 1000)).resolves.toBe(true);
    });
  });
});
