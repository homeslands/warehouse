import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialController } from './material.controller';
import { MaterialService } from './material.service';
import { Material } from './material.entity';
import { MaterialProfile } from './material.mapper';
import { MaterialUnit } from './material-unit.entity';
import { MaterialTypeModule } from 'src/material-type/material-type.module';
import { UnitModule } from 'src/unit/unit.module';
import { DbModule } from 'src/db/db.module';
import { Inventory } from 'src/inventory/inventory.entity';
import { Supplier } from 'src/supplier/supplier.entity';

@Module({
  // `Inventory` chỉ đăng ký để lấy Repository đếm tham chiếu lúc xoá — import entity
  // (1 class), KHÔNG import `InventoryModule` (module đó mới là bên import ngược lại).
  // `Supplier` cũng chỉ là entity: `PUT /materials/:slug/suppliers` cần tra nhà cung cấp theo slug.
  //
  // `UnitModule` thì import cả module (cần `UnitService` để resolve `baseUnitSlug` và để list đơn
  // vị quy đổi): không tạo vòng vì `UnitModule` chỉ import ENTITY `Material`, không import
  // `MaterialModule`.
  // `DbModule` cho `TransactionManagerService` — đặt/đổi đơn vị cơ sở ghi 2 bảng theo thứ tự bắt
  // buộc bởi FK tổ hợp, không thể để nửa chừng.
  imports: [
    TypeOrmModule.forFeature([Material, MaterialUnit, Inventory, Supplier]),
    MaterialTypeModule,
    UnitModule,
    DbModule,
  ],
  controllers: [MaterialController],
  providers: [MaterialService, MaterialProfile],
  exports: [MaterialService],
})
export class MaterialModule {}
