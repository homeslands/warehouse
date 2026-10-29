import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialBatchController } from './material-batch.controller';
import { MaterialBatchService } from './material-batch.service';
import { MaterialBatch } from './material-batch.entity';
import { MaterialBatchProfile } from './material-batch.mapper';
import { Warehouse } from 'src/warehouse/warehouse.entity';

/**
 * Export `MaterialBatchService` cho `ImportFormModule` (sinh lô khi xác nhận phiếu nhập) và
 * `ExportFormModule` (trừ lô khi xác nhận phiếu xuất). Module này không import 2 module phiếu —
 * chỉ tham chiếu entity `ImportFormItem` — nên không vòng.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MaterialBatch, Warehouse])],
  controllers: [MaterialBatchController],
  providers: [MaterialBatchService, MaterialBatchProfile],
  exports: [MaterialBatchService],
})
export class MaterialBatchModule {}
