import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialController } from './material.controller';
import { MaterialService } from './material.service';
import { Material } from './material.entity';
import { MaterialProfile } from './material.mapper';
import { MaterialUnit } from './material-unit.entity';
import { MaterialTypeModule } from 'src/material-type/material-type.module';
import { UnitModule } from 'src/unit/unit.module';
import { WarehouseMaterial } from 'src/warehouse-material/warehouse-material.entity';

@Module({
  // `WarehouseMaterial` chỉ đăng ký để lấy Repository đếm tham chiếu lúc xoá — import entity
  // (1 class), KHÔNG import `WarehouseMaterialModule` (module đó mới là bên import ngược lại).
  //
  // `UnitModule` thì import cả module (cần `UnitService` để resolve `baseUnitSlug` và để list đơn
  // vị quy đổi): không tạo vòng vì `UnitModule` chỉ import ENTITY `Material`, không import
  // `MaterialModule`.
  imports: [
    TypeOrmModule.forFeature([Material, MaterialUnit, WarehouseMaterial]),
    MaterialTypeModule,
    UnitModule,
  ],
  controllers: [MaterialController],
  providers: [MaterialService, MaterialProfile],
  exports: [MaterialService],
})
export class MaterialModule {}
