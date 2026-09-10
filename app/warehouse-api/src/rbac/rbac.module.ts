import { Module } from '@nestjs/common';
import { RoleModule } from 'src/role/role.module';
import { UserModule } from 'src/user/user.module';
import { RbacCacheService } from './rbac-cache.service';
import { RbacService } from './rbac.service';

/**
 * Không `@Global()` — import tường minh ở `AuthModule`/`PermissionModule` (theo tiền lệ
 * `TokenRevocationModule`), để nếu sau này `RoleModule`/`UserModule` cần tới nó thì vòng tròn hiện
 * ra ngay lúc compile thay vì bị global che mất.
 *
 * `RbacCacheService` chỉ cần `RedisService` + `ConfigService` (`RedisModule`/`ConfigModule` đều
 * `@Global()`, giống cách `TokenRevocationModule` lấy Redis).
 */
@Module({
  imports: [RoleModule, UserModule],
  providers: [RbacCacheService, RbacService],
  exports: [RbacService],
})
export class RbacModule {}
