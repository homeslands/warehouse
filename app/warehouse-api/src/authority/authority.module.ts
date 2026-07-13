import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorityGroupModule } from 'src/authority-group/authority-group.module';
import { Authority } from './authority.entity';
import { AuthorityProfile } from './authority.mapper';
import { AuthorityController } from './authority.controller';
import { AuthorityService } from './authority.service';

@Module({
  imports: [TypeOrmModule.forFeature([Authority]), AuthorityGroupModule],
  controllers: [AuthorityController],
  providers: [AuthorityService, AuthorityProfile],
  exports: [TypeOrmModule],
})
export class AuthorityModule {}
