import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialController } from './material.controller';
import { MaterialService } from './material.service';
import { Material } from './material.entity';
import { MaterialProfile } from './material.mapper';
import { MaterialTypeModule } from 'src/material-type/material-type.module';
import { WarehouseMaterial } from 'src/warehouse-material/warehouse-material.entity';

@Module({
  // `WarehouseMaterial` chỉ đăng ký để lấy Repository đếm tham chiếu lúc xoá — import entity
  // (1 class), KHÔNG import `WarehouseMaterialModule` (module đó mới là bên import ngược lại).
  imports: [TypeOrmModule.forFeature([Material, WarehouseMaterial]), MaterialTypeModule],
  controllers: [MaterialController],
  providers: [MaterialService, MaterialProfile],
  exports: [MaterialService],
})
export class MaterialModule {}
