import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from 'src/redis/redis.service';
import { RbacCacheService } from './rbac-cache.service';
import {
  RBAC_CACHED_MEMBER,
  RBAC_ROLE_CACHE_TTL,
  roleAuthoritiesKey,
  userKey,
} from './rbac.constants';

const USER_ID = 'user-id';
const DURATION = 900;
const USER_KEY = 'rbac:user:user-id';
const ROLE_KEY = 'rbac:role:ADMIN:authorities';

const PERMISSIONS = ['EXAMPLE_CREATE', 'USER_CHANGE_PASSWORD'];

/** Bắt chước chain `multi()` của ioredis: mỗi lệnh trả lại chính nó, `exec()` chốt lại. */
const createTransaction = () => {
  const transaction = {
    del: jest.fn(() => transaction),
    sadd: jest.fn(() => transaction),
    expire: jest.fn(() => transaction),
    exec: jest.fn<Promise<[Error | null, unknown][] | null>, []>(),
  };
  return transaction;
};

describe('RbacCacheService', () => {
  let service: RbacCacheService;
  let transaction: ReturnType<typeof createTransaction>;

  const client = {
    multi: jest.fn(() => transaction),
    del: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    smembers: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    transaction = createTransaction();
    transaction.exec.mockResolvedValue([]);
    client.multi.mockImplementation(() => transaction);
    client.del.mockResolvedValue(1);
    client.get.mockResolvedValue(null);
    client.smembers.mockResolvedValue([]);
    client.set.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacCacheService,
        { provide: RedisService, useValue: { getClient: () => client } },
        {
          provide: ConfigService,
          useValue: {
            get: () => `${DURATION}`,
          },
        },
      ],
    }).compile();

    service = module.get<RbacCacheService>(RbacCacheService);
  });

  // Ghim đúng chuỗi key: đây là "hợp đồng" với người vận hành (redis-cli) và với spec
  // `docs/specs/rbac.md`, không chỉ là chi tiết nội bộ.
  describe('redis key format', () => {
    it('pins the wire format of every key', () => {
      expect(userKey(USER_ID)).toBe(USER_KEY);
      expect(RBAC_CACHED_MEMBER).toBe('@cached');
      expect(roleAuthoritiesKey('ADMIN')).toBe(ROLE_KEY);
    });
  });

  describe('set', () => {
    it('rewrites the single key with the cached flag, TTL = DURATION in seconds', async () => {
      await service.set(USER_ID, PERMISSIONS);

      // DEL trước SADD: SADD hợp nhất vào set cũ, thiếu DEL thì quyền vừa thu hồi vẫn nằm lại.
      expect(transaction.del).toHaveBeenCalledWith(USER_KEY);
      expect(transaction.sadd).toHaveBeenCalledWith(
        USER_KEY,
        '@cached',
        'EXAMPLE_CREATE',
        'USER_CHANGE_PASSWORD',
      );
      expect(transaction.expire).toHaveBeenCalledWith(USER_KEY, DURATION);
      expect(transaction.exec).toHaveBeenCalled();
    });

    // Cache chỉ chứa quyền nên không còn gì khác giữ cho key tồn tại — `@cached` phải được ghi kể
    // cả khi role không có quyền nào (`SUPER_ADMIN` là trường hợp có thật), nếu không key biến mất
    // và mọi request của user đó rơi xuống MySQL.
    it('still writes the flag when the role has no authority at all', async () => {
      await service.set(USER_ID, []);

      expect(transaction.sadd).toHaveBeenCalledWith(USER_KEY, '@cached');
      expect(transaction.expire).toHaveBeenCalledWith(USER_KEY, DURATION);
    });

    it('swallows redis errors (fail-open)', async () => {
      transaction.exec.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.set(USER_ID, PERMISSIONS)).resolves.toBeUndefined();
    });
  });

  describe('get', () => {
    it('reads one SMEMBERS and strips the flag', async () => {
      client.smembers.mockResolvedValue(['@cached', 'EXAMPLE_CREATE', 'USER_CHANGE_PASSWORD']);

      expect(await service.get(USER_ID)).toEqual(PERMISSIONS);
      expect(client.smembers).toHaveBeenCalledWith(USER_KEY);
      expect(client.multi).not.toHaveBeenCalled();
    });

    // Role không có quyền nào — phải là cache HIT (`[]`), nếu không thì mọi request của
    // `SUPER_ADMIN` đều rơi xuống MySQL.
    it('treats a set holding only the flag as a hit with an empty scope', async () => {
      client.smembers.mockResolvedValue(['@cached']);

      expect(await service.get(USER_ID)).toEqual([]);
    });

    it('returns null on miss (key không tồn tại ⇒ SMEMBERS trả mảng rỗng)', async () => {
      expect(await service.get(USER_ID)).toBeNull();
    });

    // Value do bản deploy cũ hoặc ai đó SADD tay: không có cờ ⇒ không tin được.
    it('treats a set without the flag as a miss', async () => {
      client.smembers.mockResolvedValue(['EXAMPLE_CREATE']);

      expect(await service.get(USER_ID)).toBeNull();
    });

    // Ngược với `TokenRevocationService.isRevoked` (fail-closed): ở đây Redis lỗi ⇒ miss ⇒ đọc DB.
    it('returns null instead of throwing when redis fails (fail-open)', async () => {
      client.smembers.mockRejectedValue(new Error('ECONNREFUSED'));

      expect(await service.get(USER_ID)).toBeNull();
    });
  });

  describe('delUsers', () => {
    it('deletes one key per user in one round-trip', async () => {
      await service.delUsers(['a', 'b']);

      expect(client.del).toHaveBeenCalledWith('rbac:user:a', 'rbac:user:b');
    });

    it('does not call redis for an empty list', async () => {
      await service.delUsers([]);

      expect(client.del).not.toHaveBeenCalled();
    });

    it('swallows redis errors', async () => {
      client.del.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.delUsers(['a'])).resolves.toBeUndefined();
    });
  });

  describe('role authorities', () => {
    it('writes the code list as JSON with TTL = RBAC_ROLE_CACHE_TTL in seconds', async () => {
      await service.setRoleAuthorities('ADMIN', ['EXAMPLE_CREATE']);

      expect(client.set).toHaveBeenCalledWith(
        ROLE_KEY,
        '["EXAMPLE_CREATE"]',
        'EX',
        RBAC_ROLE_CACHE_TTL,
      );
    });

    it('reads the code list back', async () => {
      client.get.mockResolvedValue('["EXAMPLE_CREATE","USER_CHANGE_PASSWORD"]');

      expect(await service.getRoleAuthorities('ADMIN')).toEqual([
        'EXAMPLE_CREATE',
        'USER_CHANGE_PASSWORD',
      ]);
      expect(client.get).toHaveBeenCalledWith(ROLE_KEY);
    });

    // Lý do value là STRING JSON chứ không phải SET: Redis không lưu SET rỗng, còn role được cấp 0
    // quyền vẫn phải là cache HIT (`[]`), không được rơi xuống MySQL ở mọi request.
    it('distinguishes an empty cached list from a missing key', async () => {
      client.get.mockResolvedValue('[]');
      expect(await service.getRoleAuthorities('ADMIN')).toEqual([]);

      client.get.mockResolvedValue(null);
      client.smembers.mockResolvedValue([]);
      expect(await service.getRoleAuthorities('ADMIN')).toBeNull();
    });

    it('treats a corrupted value as a miss', async () => {
      client.get.mockResolvedValue('{oops');
      expect(await service.getRoleAuthorities('ADMIN')).toBeNull();

      client.get.mockResolvedValue('{"ADMIN":[]}');
      expect(await service.getRoleAuthorities('ADMIN')).toBeNull();

      client.get.mockResolvedValue('[1,2]');
      expect(await service.getRoleAuthorities('ADMIN')).toBeNull();
    });

    it('deletes one role key', async () => {
      await service.delRole('ADMIN');

      expect(client.del).toHaveBeenCalledWith(ROLE_KEY);
    });

    it('swallows redis errors (fail-open)', async () => {
      client.get.mockRejectedValue(new Error('ECONNREFUSED'));
      client.set.mockRejectedValue(new Error('ECONNREFUSED'));
      client.del.mockRejectedValue(new Error('ECONNREFUSED'));

      expect(await service.getRoleAuthorities('ADMIN')).toBeNull();
      await expect(service.setRoleAuthorities('ADMIN', ['A'])).resolves.toBeUndefined();
      await expect(service.delRole('ADMIN')).resolves.toBeUndefined();
    });
  });
});
