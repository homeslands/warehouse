import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { CodeType } from './code-generate.constants';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * PATCH partial. `prefix` chỉ chặn hình dạng chung (2 ký tự chữ HOA/số) ở DTO; rào riêng theo loại
 * (`BARCODE` phải là 2 chữ số) nằm ở `CodeRuleService` vì DTO không biết `:type` trên route.
 */
export class UpdateCodeRuleRequestDto {
  @AutoMap()
  @ApiPropertyOptional({
    description: 'Prefix printed on generated codes (2 chars; BARCODE: 2 digits)',
    example: 'IT',
  })
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z0-9]{2}$/, { message: 'CODE_RULE_PREFIX_INVALID' })
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
  @ApiProperty({ enum: CodeType })
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
