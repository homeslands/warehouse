import Redis from 'ioredis';
import { DataSource, Equal } from 'typeorm';
import { roleAuthoritiesKey, userKey } from 'src/rbac/rbac.constants';
import { V1UserRoleRecord } from './rbac-v1-records.entity';

/**
 * Sau khi v1 đổi quyền/tên của role, xoá cache RBAC **của legacy** (Redis `REDIS_AUTH_DB`) cho role đó, để route
 * legacy không dùng quyền cũ (cùng key và cùng cách xoá như `RbacService.invalidateRole`, không sửa code legacy).
 * Gọi SAU commit. Lỗi Redis ⇒ chỉ log (giống legacy `RbacCacheService`, fail-open có giới hạn TTL: role 300 s,
 * user `DURATION`). Storage v1 không dùng cache này — v1 đọc quyền từ DB mỗi RPC.
 */
export interface LegacyRbacCacheInvalidator {
  invalidateRole(roleId: string, roleNames: readonly string[]): Promise<void>;
}

export class RedisLegacyRbacCacheInvalidator implements LegacyRbacCacheInvalidator {
  constructor(
    private readonly redis: Redis,
    private readonly dataSource: DataSource,
    private readonly logWarn: (message: string) => void,
  ) {}

  async invalidateRole(roleId: string, roleNames: readonly string[]): Promise<void> {
    try {
      const users = await this.dataSource.getRepository(V1UserRoleRecord).find({
        select: { id: true },
        where: { roleId: Equal(roleId) },
        withDeleted: true,
      });
      const keys = [...users.map((user) => userKey(user.id)), ...roleNames.map(roleAuthoritiesKey)];
      if (keys.length) await this.redis.del(...keys);
    } catch (error) {
      // Cố ý không ném: lệnh v1 đã commit; cache legacy tự hết hạn theo TTL (fail-open như legacy).
      this.logWarn(
        `legacy RBAC cache invalidation failed for role ${roleId}: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }
}
