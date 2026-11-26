import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { CodeRule } from './code-rule.entity';
import { CodeRuleResponseDto, UpdateCodeRuleRequestDto } from './code-rule.dto';
import { CODE_RULE_TYPES, CodeRuleType } from './code-generate.constants';
import { CodeGenerateException } from './code-generate.exception';
import { CodeGenerateValidation } from './code-generate.validation';
import { pickDefined } from 'src/shared/utils/obj.util';

// Không có `BARCODE`: tiền tố mã vạch lấy từ env `BARCODE_PREFIX` ⇒ `/code-rules/BARCODE` trả
// `CODE_RULE_TYPE_INVALID`.
const CODE_TYPES = new Set<string>(CODE_RULE_TYPES);

@Injectable()
export class CodeRuleService {
  constructor(
    @InjectRepository(CodeRule) private readonly codeRuleRepository: Repository<CodeRule>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async findAll(): Promise<CodeRuleResponseDto[]> {
    const rules = await this.codeRuleRepository.find({ order: { type: 'ASC' } });
    return this.mapper.mapArray(rules, CodeRule, CodeRuleResponseDto);
  }

  async findOne(type: string): Promise<CodeRuleResponseDto> {
    return this.mapper.map(await this.findEntity(type), CodeRule, CodeRuleResponseDto);
  }

  async updateCodeRule(type: string, dto: UpdateCodeRuleRequestDto): Promise<CodeRuleResponseDto> {
    const context = `${CodeRuleService.name}.${this.updateCodeRule.name}`;
    const rule = await this.findEntity(type);

    const data = pickDefined(this.mapper.map(dto, UpdateCodeRuleRequestDto, CodeRule));
    Object.assign(rule, data);
    const updated = await this.codeRuleRepository.save(rule);
    this.logger.log(`Code rule updated: ${updated.type} -> ${updated.prefix}`, context);
    return this.mapper.map(updated, CodeRule, CodeRuleResponseDto);
  }

  private async findEntity(type: string): Promise<CodeRule> {
    const normalized = type?.trim().toUpperCase();
    if (!CODE_TYPES.has(normalized))
      throw new CodeGenerateException(CodeGenerateValidation.CODE_RULE_TYPE_INVALID);
    const rule = await this.codeRuleRepository.findOneBy({ type: normalized as CodeRuleType });
    if (!rule) throw new CodeGenerateException(CodeGenerateValidation.CODE_RULE_NOT_FOUND);
    return rule;
  }
}
