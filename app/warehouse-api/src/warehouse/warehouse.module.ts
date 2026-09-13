import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { Warehouse } from './warehouse.entity';
import { WarehouseProfile } from './warehouse.mapper';
import { UserModule } from 'src/user/user.module';

@Module({
  // `UserModule` export sẵn `UserService` (dùng `findBySlug` để tra manager). Chiều phụ thuộc là 1
  // chiều `Warehouse -> User`, không cần `forwardRef`.
  imports: [TypeOrmModule.forFeature([Warehouse]), UserModule],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseProfile],
  exports: [WarehouseService],
})
export class WarehouseModule {}
