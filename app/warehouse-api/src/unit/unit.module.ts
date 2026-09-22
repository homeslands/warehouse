import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitController } from './unit.controller';
import { UnitService } from './unit.service';
import { Unit } from './unit.entity';
import { UnitProfile } from './unit.mapper';
import { Material } from 'src/material/material.entity';

@Module({
  // `Material` đăng ký ở đây chỉ để lấy `Repository<Material>` đếm tham chiếu qua bảng join lúc
  // xoá — import entity (1 class) chứ không import `MaterialModule`, nên không tạo vòng phụ thuộc.
  imports: [TypeOrmModule.forFeature([Unit, Material])],
  controllers: [UnitController],
  providers: [UnitService, UnitProfile],
  exports: [UnitService],
})
export class UnitModule {}
