import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { Store } from './store.entity';
import { StoreProfile } from './store.mapper';
import { Warehouse } from 'src/warehouse/warehouse.entity';

@Module({
  // `Warehouse` chỉ cần Repository (tra kho theo slug + check `isActive` lúc gắn quan hệ 1-1), nên
  // đăng ký entity thay vì import `WarehouseModule` — giống `WarehouseMaterialModule`.
  imports: [TypeOrmModule.forFeature([Store, Warehouse])],
  controllers: [StoreController],
  providers: [StoreService, StoreProfile],
  exports: [StoreService],
})
export class StoreModule {}
