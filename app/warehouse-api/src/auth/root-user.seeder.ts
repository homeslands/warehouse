import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { UserService } from 'src/user/user.service';
import { RoleService } from 'src/role/role.service';
import { RoleEnum } from 'src/role/role.enum';

@Injectable()
export class RootUserSeeder implements OnApplicationBootstrap {
  private readonly rootPhonenumber: string;
  private readonly rootPassword: string;

  constructor(
    private readonly userService: UserService,
    private readonly roleService: RoleService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {
    this.rootPhonenumber = this.configService.get('ROOT_PHONENUMBER') ?? 'root';
    this.rootPassword = this.configService.get('ROOT_PASSWORD') ?? 'root';
  }

  async onApplicationBootstrap(): Promise<void> {
    const existed = await this.userService.findByPhoneNumber(this.rootPhonenumber);
    if (existed) return;

    const superAdminRole = await this.roleService.findByName(RoleEnum.SuperAdmin);
    if (!superAdminRole) {
      this.logger.warn('Skip seeding root user: SUPER_ADMIN role not found', {
        context: 'RootUserSeeder',
      });
      return;
    }

    // UserService.createUser tự hash password bằng SALT_ROUNDS.
    await this.userService.createUser({
      phonenumber: this.rootPhonenumber,
      password: this.rootPassword,
      roleSlug: superAdminRole.slug,
      firstName: 'Root',
      lastName: 'Admin',
    });

    this.logger.log(`Root user has been seeded (phonenumber: ${this.rootPhonenumber})`, {
      context: 'RootUserSeeder',
    });
  }
}
