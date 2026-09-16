import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { Store } from './store.entity';
import { StoreProfile } from './store.mapper';

@Module({
  // Không import module nào khác: `Store` không có FK tới `User`/`Warehouse` (xem
  // `docs/specs/store.md`), nên không cần `UserModule` như `WarehouseModule`.
  imports: [TypeOrmModule.forFeature([Store])],
  controllers: [StoreController],
  providers: [StoreService, StoreProfile],
  exports: [StoreService],
})
export class StoreModule {}
