import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeSequence } from './code-sequence.entity';
import { CodeRule } from './code-rule.entity';
import { CodeGenerateService } from './code-generate.service';
import { CodeRuleService } from './code-rule.service';
import { CodeRuleController } from './code-rule.controller';
import { CodeRuleProfile } from './code-rule.mapper';
import { BarcodeController } from './barcode.controller';
import { BarcodeService } from './barcode.service';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { DbModule } from 'src/db/db.module';

/**
 * Sinh mã nghiệp vụ tự động cho mọi `CodeType`. Module khác import và gọi
 * `CodeGenerateService.generate(manager, ...)` bên trong transaction của chính nó. Controller:
 * `/code-rules` (quản lý tiền tố) và `POST /warehouses/:slug/materials/barcode` (cấp mã vạch).
 * `Warehouse` chỉ cần Repository (tra kho theo slug), `DbModule` cho `TransactionManagerService`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CodeSequence, CodeRule, Warehouse]), DbModule],
  controllers: [CodeRuleController, BarcodeController],
  providers: [CodeGenerateService, CodeRuleService, CodeRuleProfile, BarcodeService],
  exports: [CodeGenerateService],
})
export class CodeGenerateModule {}
