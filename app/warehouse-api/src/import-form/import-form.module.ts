import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportFormController } from './import-form.controller';
import { ImportFormService } from './import-form.service';
import { ImportForm } from './import-form.entity';
import { ImportFormProfile } from './import-form.mapper';
import { Supplier } from 'src/supplier/supplier.entity';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';

@Module({
  // Kho/nhà cung cấp/user chỉ cần tra theo slug/id ⇒ đăng ký entity thay vì import module của chúng
  // (cùng cách `InventoryModule` làm với `Warehouse`).
  imports: [TypeOrmModule.forFeature([ImportForm, Warehouse, Supplier, User])],
  controllers: [ImportFormController],
  providers: [ImportFormService, ImportFormProfile],
  exports: [ImportFormService],
})
export class ImportFormModule {}
