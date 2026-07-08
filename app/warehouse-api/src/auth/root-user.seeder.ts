import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as bcrypt from 'bcrypt';
import { User } from 'src/user/user.entity';
import { Role } from 'src/role/role.entity';
import { RoleEnum } from 'src/role/role.enum';

@Injectable()
export class RootUserSeeder implements OnApplicationBootstrap {
  private readonly rootPhonenumber: string;
  private readonly rootPassword: string;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {
    this.rootPhonenumber = this.configService.get('ROOT_PHONENUMBER') ?? 'root';
    this.rootPassword = this.configService.get('ROOT_PASSWORD') ?? 'root';
  }

  async onApplicationBootstrap(): Promise<void> {
    const existed = await this.userRepository.findOneBy({ phonenumber: this.rootPhonenumber });
    if (existed) return;

    const superAdminRole = await this.roleRepository.findOneBy({ name: RoleEnum.SuperAdmin });
    if (!superAdminRole) {
      this.logger.warn('Skip seeding root user: SUPER_ADMIN role not found', {
        context: 'RootUserSeeder',
      });
      return;
    }

    const saltRounds = parseInt(this.configService.get('SALT_ROUNDS'), 10);
    const hashedPassword = await bcrypt.hash(this.rootPassword, saltRounds);

    const rootUser = this.userRepository.create({
      phonenumber: this.rootPhonenumber,
      password: hashedPassword,
      role: superAdminRole,
    });
    await this.userRepository.save(rootUser);

    this.logger.log(`Root user has been seeded (phonenumber: ${this.rootPhonenumber})`, {
      context: 'RootUserSeeder',
    });
  }
}
