import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { Supplier } from './supplier.entity';
import { SupplierTransaction } from './supplier-transaction.entity';
import { SupplierProfile } from './supplier.mapper';
import { Material } from 'src/material/material.entity';

@Module({
  // `Material` đăng ký trực tiếp (không import `MaterialModule`) vì chỉ cần đọc/ghi cột
  // `supplier_id_column` — không đi qua nghiệp vụ đơn vị quy đổi của `MaterialService`.
  imports: [TypeOrmModule.forFeature([Supplier, SupplierTransaction, Material])],
  controllers: [SupplierController],
  providers: [SupplierService, SupplierProfile],
  exports: [SupplierService],
})
export class SupplierModule {}
