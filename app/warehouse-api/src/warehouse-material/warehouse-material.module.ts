import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseMaterialController } from './warehouse-material.controller';
import { WarehouseMaterialService } from './warehouse-material.service';
import { WarehouseMaterial } from './warehouse-material.entity';
import { WarehouseMaterialProfile } from './warehouse-material.mapper';
import { MaterialModule } from 'src/material/material.module';
import { Warehouse } from 'src/warehouse/warehouse.entity';

@Module({
  // Chiều phụ thuộc 1 chiều: `WarehouseMaterial -> Material`. `Warehouse` chỉ cần Repository (tra
  // kho theo slug + check `isActive`), nên đăng ký entity thay vì import `WarehouseModule`.
  imports: [TypeOrmModule.forFeature([WarehouseMaterial, Warehouse]), MaterialModule],
  controllers: [WarehouseMaterialController],
  providers: [WarehouseMaterialService, WarehouseMaterialProfile],
  exports: [WarehouseMaterialService],
})
export class WarehouseMaterialModule {}
