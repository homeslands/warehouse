import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeSequence } from './code-sequence.entity';
import { CodeGenerateService } from './code-generate.service';

/**
 * Sinh mã nghiệp vụ tự động cho mọi `CodeType`. Không có controller — module khác import và gọi
 * `CodeGenerateService.generate(manager, ...)` bên trong transaction của chính nó.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CodeSequence])],
  providers: [CodeGenerateService],
  exports: [CodeGenerateService],
})
export class CodeGenerateModule {}
