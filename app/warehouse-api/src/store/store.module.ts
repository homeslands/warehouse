import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { Store } from './store.entity';
import { StoreProfile } from './store.mapper';
import { StoreWarehouseHistory } from './store-warehouse-history.entity';
import { DbModule } from 'src/db/db.module';

@Module({
  // Kho được tra qua `EntityManager` của transaction gắn kho, nên không cần đăng ký `Warehouse` hay
  // import `WarehouseModule`. `DbModule` cho `TransactionManagerService`: gắn kho ghi 2 dòng `store_tbl` + lịch sử theo thứ tự
  // bắt buộc bởi `UQ_store_warehouse`, không được để nửa chừng.
  imports: [TypeOrmModule.forFeature([Store, StoreWarehouseHistory]), DbModule],
  controllers: [StoreController],
  providers: [StoreService, StoreProfile],
  exports: [StoreService],
})
export class StoreModule {}
