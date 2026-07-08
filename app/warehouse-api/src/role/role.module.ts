import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';
import { Authority } from './authority.entity';
import { AuthorityGroup } from './authority-group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, Authority, AuthorityGroup])],
  exports: [TypeOrmModule],
})
export class RoleModule {}
