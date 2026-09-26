import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UserService } from 'src/user/user.service';
import { RoleService } from 'src/role/role.service';
import { RoleEnum } from 'src/role/role.enum';
import { RbacService } from 'src/rbac/rbac.service';
import { User } from 'src/user/user.entity';

@Injectable()
export class RootUserSeeder implements OnApplicationBootstrap {
  private readonly rootPhonenumber: string;
  private readonly rootPassword: string;

  constructor(
    private readonly userService: UserService,
    private readonly roleService: RoleService,
    private readonly rbacService: RbacService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {
    this.rootPhonenumber = this.configService.get('ROOT_PHONENUMBER') ?? 'root';
    this.rootPassword = this.configService.get('ROOT_PASSWORD') ?? 'root';
  }

  /**
   * KHÔNG được throw: lỗi ở hook `onApplicationBootstrap` làm `NestFactory.create()` reject ⇒ cả app
   * chết. Seed root chỉ là tiện ích lúc dev/deploy lần đầu, không đáng đánh sập API — lỗi DB (mất
   * kết nối, schema lệch vì chưa chạy migration: `Unknown column ...`) chỉ được log lại.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (error) {
      this.logger.error(
        `Skip seeding root user: ${error instanceof Error ? error.message : String(error)}. ` +
          'If this is a schema error, run pending migrations (`npm run typeorm:r`).',
        { context: 'RootUserSeeder', stack: error instanceof Error ? error.stack : undefined },
      );
    }
  }

  private async seed(): Promise<void> {
    const existed = await this.userService.findByPhoneNumber(this.rootPhonenumber);
    if (existed) {
      await this.warmCache(existed);
      return;
    }

    const superAdminRole = await this.roleService.findByName(RoleEnum.SuperAdmin);
    if (!superAdminRole) {
      this.logger.warn('Skip seeding root user: SUPER_ADMIN role not found', {
        context: 'RootUserSeeder',
      });
      return;
    }

    // UserService.createUser tự hash password bằng SALT_ROUNDS. `actor = null`: hệ thống tự tạo,
    // không có người thao tác để so cấp.
    await this.userService.createUser(
      {
        phonenumber: this.rootPhonenumber,
        firstName: 'Root',
        lastName: 'User',
        password: this.rootPassword,
        roleSlug: superAdminRole.slug,
      },
      null,
    );

    this.logger.log(`Root user has been seeded (phonenumber: ${this.rootPhonenumber})`, {
      context: 'RootUserSeeder',
    });

    const created = await this.userService.findByPhoneNumber(this.rootPhonenumber);
    if (created) await this.warmCache(created);
  }

  /**
   * Ghi đè cache RBAC của root (`rbac:user:{id}`) bằng quyền đọc từ DB: cache sót lại từ lần chạy
   * trước (DB vừa reset / role vừa đổi) không sống tới hết TTL. `RbacCacheService` fail-open nên
   * Redis lỗi ở đây chỉ bị log warn, không throw.
   */
  private async warmCache(user: User): Promise<void> {
    if (user.isActive) await this.rbacService.refresh(user);
  }
}
