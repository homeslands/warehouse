import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialTypeController } from './material-type.controller';
import { MaterialTypeService } from './material-type.service';
import { MaterialType } from './material-type.entity';
import { MaterialTypeProfile } from './material-type.mapper';
import { Material } from 'src/material/material.entity';

@Module({
  // `Material` đăng ký ở đây chỉ để lấy `Repository<Material>` đếm tham chiếu lúc xoá — import
  // entity (1 class) chứ không import `MaterialModule`, nên không tạo vòng phụ thuộc module.
  imports: [TypeOrmModule.forFeature([MaterialType, Material])],
  controllers: [MaterialTypeController],
  providers: [MaterialTypeService, MaterialTypeProfile],
  exports: [MaterialTypeService],
})
export class MaterialTypeModule {}
