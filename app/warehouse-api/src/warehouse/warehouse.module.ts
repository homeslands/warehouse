import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { Warehouse } from './warehouse.entity';
import { WarehouseMember } from './warehouse-member.entity';
import { WarehouseProfile } from './warehouse.mapper';
import { UserModule } from 'src/user/user.module';
import { DbModule } from 'src/db/db.module';
import { CodeGenerateModule } from 'src/code-generate/code-generate.module';

@Module({
  // `UserModule` export sẵn `UserService` (dùng `findBySlug` để tra manager). Chiều phụ thuộc là 1
  // chiều `Warehouse -> User`, không cần `forwardRef`. `CodeGenerateModule` + `DbModule`: sinh số kho
  // + mã kho trong transaction tạo kho (`CodeGenerateModule` chỉ đăng ký entity `Warehouse`, không
  // import ngược `WarehouseModule`).
  imports: [
    TypeOrmModule.forFeature([Warehouse, WarehouseMember]),
    UserModule,
    DbModule,
    CodeGenerateModule,
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseProfile],
  exports: [WarehouseService],
})
export class WarehouseModule {}
