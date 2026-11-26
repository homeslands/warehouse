import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { Inventory } from './inventory.entity';
import { InventoryHistory } from './inventory-history.entity';
import { InventoryProfile } from './inventory.mapper';
import { MaterialModule } from 'src/material/material.module';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { DbModule } from 'src/db/db.module';
import { Supplier } from 'src/supplier/supplier.entity';
import { CodeGenerateModule } from 'src/code-generate/code-generate.module';

@Module({
  // Chiều phụ thuộc 1 chiều: `Inventory -> Material`. `Warehouse` chỉ cần Repository (tra
  // kho theo slug + check `isActive`), nên đăng ký entity thay vì import `WarehouseModule`.
  // `DbModule` cho `TransactionManagerService`: thay đổi tồn + dòng `InventoryHistory` cùng 1
  // transaction, có khoá `pessimistic_write` trên dòng tồn. `Supplier` chỉ để tra theo slug khi tạo
  // vật tư mới kèm nhà cung cấp (`POST`), cũng đăng ký entity thay vì import `SupplierModule`.
  imports: [
    TypeOrmModule.forFeature([Inventory, InventoryHistory, Warehouse, Supplier]),
    MaterialModule,
    DbModule,
    // Sinh mã vật tư khi tạo (`POST .../materials`).
    CodeGenerateModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryProfile],
  exports: [InventoryService],
})
export class InventoryModule {}
