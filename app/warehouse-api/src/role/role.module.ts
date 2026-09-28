import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { RoleProfile } from './role.mapper';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { User } from 'src/user/user.entity';

@Module({
  // `User` chỉ đăng ký để đếm user còn giữ role lúc xoá — import entity, KHÔNG import `UserModule`
  // (module đó import ngược lại `RoleModule`).
  imports: [TypeOrmModule.forFeature([Role, User])],
  controllers: [RoleController],
  providers: [RoleService, RoleProfile],
  exports: [RoleService],
})
export class RoleModule {}
