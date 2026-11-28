import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemController } from './item.controller';
import { ItemService } from './item.service';
import { Item } from './item.entity';
import { ItemProfile } from './item.mapper';
import { Warehouse } from 'src/warehouse/warehouse.entity';

/**
 * Export `ItemService` cho `ImportFormModule` (nhập kho / huỷ item khi xác nhận / huỷ phiếu nhập) và
 * `ExportFormModule` (giữ chỗ / trừ item theo phiếu xuất). Module này không import 2 module phiếu —
 * chỉ tham chiếu entity `ImportForm` — nên không vòng.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Item, Warehouse])],
  controllers: [ItemController],
  providers: [ItemService, ItemProfile],
  exports: [ItemService],
})
export class ItemModule {}
