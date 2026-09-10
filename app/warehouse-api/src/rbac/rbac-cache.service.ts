import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/redis/redis.service';
import {
  RBAC_CACHED_MEMBER,
  RBAC_ROLE_CACHE_TTL,
  roleAuthoritiesKey,
  userKey,
} from './rbac.constants';

/**
 * Thao tác Redis cho cache RBAC, dùng `ioredis` qua `RedisService` — **cùng một connection** với
 * `TokenRevocationService`, không mở client thứ 2.
 *
 * 2 lớp cache:
 * - **per-user** (`rbac:user:{userId}`, TTL = `DURATION`) — **1 SET duy nhất** chứa các
 *   `Authority.code` (+ member cờ `@cached`), đọc bằng đúng 1 `SMEMBERS`. Thứ `JwtStrategy` đọc ở
 *   mỗi request. KHÔNG chứa `userName`/`roleName`: `roleName` đã là claim trong JWT, `userName` thì
 *   chỉ `GET /auth/me` cần nên endpoint đó đọc DB.
 * - **per-role** (`rbac:role:{roleName}:authorities`, TTL = `RBAC_ROLE_CACHE_TTL`) — danh sách
 *   `Authority.code` của role, được hỏi TRƯỚC khi query MySQL khi phải tính lại quyền của 1 user.
 *
 * **Fail-open**: mọi method nuốt lỗi Redis (log warn) — `get` trả `null` như cache miss để caller
 * đọc lại DB, `set`/`del` coi như không làm gì. Ngược với `TokenRevocationService` (fail-closed) —
 * đừng copy nhầm hướng xử lý lỗi giữa 2 chỗ; ở đây DB vẫn là nguồn thật để đối chiếu, bên kia thì không.
 *
 * TTL = `DURATION` (hạn access token): key sống đúng bằng token phát ra lúc login. Token từ
 * `/auth/refresh` có hạn mới nên cache được ghi lại ở đó; nếu vẫn hụt (Redis restart...) thì miss →
 * `RbacService.resolve` tính lại và ghi lại với đủ TTL.
 */
@Injectable()
export class RbacCacheService {
  private readonly logger = new Logger(RbacCacheService.name);

  /** Giây (ioredis `EXPIRE`/`SET ... EX` tính bằng giây). TTL của key per-user. */
  private readonly ttl: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.ttl = parseInt(configService.get('DURATION'), 10);
  }

  /**
   * 1 lệnh `SMEMBERS` — không cần `MULTI` vì chỉ còn 1 key, nên cũng không còn khe hở "1 trong 2
   * key hết TTL giữa chừng" như bản 2 key trước đây.
   *
   * Hit/miss quyết định bởi member `@cached`, KHÔNG phải bởi số lượng quyền: role được cấp 0 quyền
   * (vd `SUPER_ADMIN`) vẫn là hit với `[]`. Key không tồn tại ⇒ `SMEMBERS` trả mảng rỗng ⇒ miss.
   */
  async get(userId: string): Promise<string[] | null> {
    try {
      const members = await this.redisService.getClient().smembers(userKey(userId));

      // Không có cờ ⇒ chưa cache, hoặc value của bản deploy cũ / ai đó `SADD` tay ⇒ tính lại từ DB.
      if (!members.includes(RBAC_CACHED_MEMBER)) return null;

      return members.filter((member) => member !== RBAC_CACHED_MEMBER);
    } catch (error) {
      this.warn('get', error);
      return null;
    }
  }

  /**
   * Ghi đè cache của 1 user. `DEL` trước `SADD` là bắt buộc: `SADD` hợp nhất vào set đang có, nếu
   * không xoá thì quyền vừa bị thu hồi vẫn nằm lại trong cache cho tới khi hết TTL. Cả cụm nằm
   * trong 1 `MULTI` để không có khoảnh khắc cache chỉ có một nửa.
   *
   * `@cached` luôn được ghi nên `SADD` luôn có ít nhất 1 member và key luôn tồn tại — đó là cờ
   * hit/miss, xem `rbac.constants.ts`.
   */
  async set(userId: string, permissions: string[]): Promise<void> {
    const key = userKey(userId);

    try {
      await this.redisService
        .getClient()
        .multi()
        .del(key)
        .sadd(key, RBAC_CACHED_MEMBER, ...permissions)
        .expire(key, this.ttl)
        .exec();
    } catch (error) {
      this.warn('set', error);
    }
  }

  /** Xoá cache của nhiều user (dùng khi quyền của cả role thay đổi). Rỗng thì không gọi Redis. */
  async delUsers(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    const keys = userIds.map((userId) => userKey(userId));
    try {
      await this.redisService.getClient().del(...keys);
    } catch (error) {
      this.warn('del users', error);
    }
  }

  /**
   * Danh sách `Authority.code` đã cache của 1 role. `null` = chưa cache (hoặc Redis lỗi/JSON hỏng)
   * ⇒ caller đọc DB; `[]` = đã cache và role thật sự chưa được cấp quyền nào ⇒ **không** đọc DB.
   */
  async getRoleAuthorities(roleName: string): Promise<string[] | null> {
    try {
      const raw = await this.redisService.getClient().get(roleAuthoritiesKey(roleName));
      if (raw === null) return null;

      // JSON hỏng (đổi format giữa 2 bản deploy, ai đó SET tay) ⇒ coi như miss, tính lại từ DB.
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.some((code) => typeof code !== 'string')) return null;

      return parsed as string[];
    } catch (error) {
      this.warn('get role authorities', error);
      return null;
    }
  }

  async setRoleAuthorities(roleName: string, codes: string[]): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(roleAuthoritiesKey(roleName), JSON.stringify(codes), 'EX', RBAC_ROLE_CACHE_TTL);
    } catch (error) {
      this.warn('set role authorities', error);
    }
  }

  /** Xoá cache của 1 role (dùng khi grant/revoke đổi `permission_tbl` của role đó). */
  async delRole(roleName: string): Promise<void> {
    try {
      await this.redisService.getClient().del(roleAuthoritiesKey(roleName));
    } catch (error) {
      this.warn('del role', error);
    }
  }

  private warn(operation: string, error: unknown): void {
    this.logger.warn(
      `RBAC cache ${operation} failed, falling back to DB: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
