import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeSequence } from './code-sequence.entity';
import { CodeRule } from './code-rule.entity';
import { CodeGenerateService } from './code-generate.service';
import { CodeRuleService } from './code-rule.service';
import { CodeRuleController } from './code-rule.controller';
import { CodeRuleProfile } from './code-rule.mapper';

/**
 * Sinh mã nghiệp vụ tự động cho mọi `CodeType`. Module khác import và gọi
 * `CodeGenerateService.generate(manager, ...)` bên trong transaction của chính nó. Controller duy
 * nhất là `/code-rules` (quản lý tiền tố).
 */
@Module({
  imports: [TypeOrmModule.forFeature([CodeSequence, CodeRule])],
  controllers: [CodeRuleController],
  providers: [CodeGenerateService, CodeRuleService, CodeRuleProfile],
  exports: [CodeGenerateService],
})
export class CodeGenerateModule {}
