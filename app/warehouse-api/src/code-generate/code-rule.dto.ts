import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { CODE_PREFIX_REGEX, CODE_RULE_TYPES, CodeType } from './code-generate.constants';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * PATCH partial. `prefix` là 2 ký tự chữ HOA/số cho mọi loại có quy tắc (mã vạch không có quy tắc ở
 * đây — tiền tố lấy từ env `BARCODE_PREFIX`).
 */
export class UpdateCodeRuleRequestDto {
  @AutoMap()
  @ApiPropertyOptional({
    description: 'Prefix printed on generated codes (2 uppercase letters/digits)',
    example: 'IT',
  })
  @IsOptional()
  @Transform(upper)
  @Matches(CODE_PREFIX_REGEX, { message: 'CODE_RULE_PREFIX_INVALID' })
  prefix?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Free-text description', example: 'Item code' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'CODE_RULE_DESCRIPTION_INVALID' })
  @MaxLength(255, { message: 'CODE_RULE_DESCRIPTION_INVALID' })
  description?: string;
}

export class CodeRuleResponseDto {
  @AutoMap()
  @ApiProperty({ enum: CODE_RULE_TYPES })
  type: CodeType;

  @AutoMap()
  @ApiProperty()
  prefix: string;

  @AutoMap()
  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty()
  updatedAt: string;
}
