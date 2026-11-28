import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportFormController } from './import-form.controller';
import { ImportFormService } from './import-form.service';
import { ImportForm } from './import-form.entity';
import { ImportFormProfile } from './import-form.mapper';
import { Material } from 'src/material/material.entity';
import { Supplier } from 'src/supplier/supplier.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { DbModule } from 'src/db/db.module';
import { CodeGenerateModule } from 'src/code-generate/code-generate.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { Inventory } from 'src/inventory/inventory.entity';
import { ItemModule } from 'src/item/item.module';

@Module({
  // Kho/nhà cung cấp/user/vật tư chỉ cần tra theo slug/id ⇒ đăng ký entity thay vì import module
  // của chúng (cùng cách `InventoryModule` làm với `Warehouse`). `DbModule` cho
  // `TransactionManagerService`: đầu phiếu + item ghi trong 1 transaction. `InventoryModule`
  // cho `InventoryService.receive` — xác nhận phiếu cộng tồn trong cùng transaction đổi trạng thái.
  // `Inventory` chỉ để ĐỌC (vật tư nào đã gán vào kho); mọi thay đổi tồn vẫn đi qua `InventoryService`.
  imports: [
    TypeOrmModule.forFeature([ImportForm, Warehouse, User, Material, Supplier, Inventory]),
    DbModule,
    CodeGenerateModule,
    InventoryModule,
    ItemModule,
  ],
  controllers: [ImportFormController],
  providers: [ImportFormService, ImportFormProfile],
  exports: [ImportFormService],
})
export class ImportFormModule {}
