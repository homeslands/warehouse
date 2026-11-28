import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportFormController } from './export-form.controller';
import { ExportFormService } from './export-form.service';
import { ExportForm } from './export-form.entity';
import { ExportFormItem } from './export-form-item.entity';
import { ExportFormProfile } from './export-form.mapper';
import { Material } from 'src/material/material.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { DbModule } from 'src/db/db.module';
import { CodeGenerateModule } from 'src/code-generate/code-generate.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { Inventory } from 'src/inventory/inventory.entity';
import { ItemModule } from 'src/item/item.module';
import { Item } from 'src/item/item.entity';

@Module({
  // Kho/user/vật tư/tồn/lô chỉ ĐỌC qua entity (tra theo slug/id). Mọi thay đổi tồn đi qua
  // `InventoryService.reserve/issue/release`, mọi thay đổi lô đi qua
  // `ItemService.reserve/consumeReserved/release` — cùng
  // transaction đổi trạng thái phiếu (`DbModule` cho `TransactionManagerService`).
  imports: [
    TypeOrmModule.forFeature([
      ExportForm,
      ExportFormItem,
      Warehouse,
      User,
      Material,
      Inventory,
      Item,
    ]),
    DbModule,
    CodeGenerateModule,
    InventoryModule,
    ItemModule,
  ],
  controllers: [ExportFormController],
  providers: [ExportFormService, ExportFormProfile],
  exports: [ExportFormService],
})
export class ExportFormModule {}
