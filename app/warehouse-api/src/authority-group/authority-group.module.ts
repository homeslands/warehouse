import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorityGroup } from './authority-group.entity';
import { AuthorityGroupProfile } from './authority-group.mapper';
import { AuthorityGroupController } from './authority-group.controller';
import { AuthorityGroupService } from './authority-group.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuthorityGroup])],
  controllers: [AuthorityGroupController],
  providers: [AuthorityGroupService, AuthorityGroupProfile],
  exports: [TypeOrmModule],
})
export class AuthorityGroupModule {}
