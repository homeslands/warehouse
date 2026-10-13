import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportFormController } from './import-form.controller';
import { ImportFormService } from './import-form.service';
import { ImportForm } from './import-form.entity';
import { ImportFormItem } from './import-form-item.entity';
import { ImportFormProfile } from './import-form.mapper';
import { Material } from 'src/material/material.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { DbModule } from 'src/db/db.module';

@Module({
  // Kho/nhà cung cấp/user/vật tư chỉ cần tra theo slug/id ⇒ đăng ký entity thay vì import module
  // của chúng (cùng cách `InventoryModule` làm với `Warehouse`). `DbModule` cho
  // `TransactionManagerService`: đầu phiếu + dòng vật tư ghi trong 1 transaction.
  imports: [
    TypeOrmModule.forFeature([ImportForm, ImportFormItem, Warehouse, User, Material]),
    DbModule,
  ],
  controllers: [ImportFormController],
  providers: [ImportFormService, ImportFormProfile],
  exports: [ImportFormService],
})
export class ImportFormModule {}
