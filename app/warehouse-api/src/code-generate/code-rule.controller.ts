import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import {
  HttpStatus,
  HttpCode,
  Body,
  Controller,
  ValidationPipe,
  Get,
  Patch,
  Param,
} from '@nestjs/common';
import { CodeRuleResponseDto, UpdateCodeRuleRequestDto } from './code-rule.dto';
import { CodeRuleService } from './code-rule.service';
import { CODE_RULE_TYPES } from './code-generate.constants';
import { AuthorityCode } from 'src/authority/authority.constants';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AppResponseDto } from 'src/app/app.dto';

/**
 * Quy tắc sinh mã (tiền tố theo `CodeType`). Không có POST/DELETE: loại mã là enum cố định, mọi
 * loại đã được seed ở migration `1783728000049`.
 */
@ApiTags('Code Rule')
@Controller('code-rules')
@ApiBearerAuth()
export class CodeRuleController {
  constructor(private readonly codeRuleService: CodeRuleService) {}

  @Get()
  @RequireAuthority(AuthorityCode.CodeRuleRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all code generation rules' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: CodeRuleResponseDto,
    isArray: true,
  })
  async findAll() {
    const result = await this.codeRuleService.findAll();
    return {
      message: 'All code rules have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CodeRuleResponseDto[]>;
  }

  @Get(':type')
  @RequireAuthority(AuthorityCode.CodeRuleRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a code generation rule by type' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: CodeRuleResponseDto,
  })
  @ApiParam({ name: 'type', required: true, enum: CODE_RULE_TYPES })
  async findOne(@Param('type') type: string) {
    const result = await this.codeRuleService.findOne(type);
    return {
      message: 'Code rule has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CodeRuleResponseDto>;
  }

  @Patch(':type')
  @RequireAuthority(AuthorityCode.CodeRuleUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the prefix/description of a code generation rule' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Updated', type: CodeRuleResponseDto })
  @ApiParam({ name: 'type', required: true, enum: CODE_RULE_TYPES })
  async updateCodeRule(
    @Param('type') type: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateCodeRuleRequestDto,
  ) {
    const result = await this.codeRuleService.updateCodeRule(type, requestData);
    return {
      message: 'Code rule has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<CodeRuleResponseDto>;
  }
}
