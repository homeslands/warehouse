import { IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { UNIT_CODE_REGEX } from 'src/shared/utils/code.util';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUnitRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The name of unit', example: 'Kilogram' })
  @Transform(trim)
  @IsNotEmpty({ message: 'UNIT_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'The business code of unit', example: 'KG' })
  @Transform(trim)
  @Matches(UNIT_CODE_REGEX, { message: 'UNIT_CODE_INVALID' })
  @IsNotEmpty({ message: 'UNIT_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The description of unit' })
  @IsOptional()
  @Transform(trim)
  description?: string;
}

/**
 * PATCH đúng nghĩa REST: mọi field nghiệp vụ đều optional, field nào không gửi thì giữ nguyên giá
 * trị cũ (`PartialType` gắn `@IsOptional()` lên toàn bộ field thừa hưởng, validator vẫn chạy khi
 * field CÓ mặt).
 */
export class UpdateUnitRequestDto extends PartialType(CreateUnitRequestDto) {}

export class GetAllUnitRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by exact business code', example: 'KG' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code?: string;

  @ApiPropertyOptional({
    description: 'Filter by name (case-insensitive substring match)',
  })
  @IsOptional()
  @Transform(trim)
  name?: string;
}

export class UnitMaterialCountDto {
  @ApiProperty({
    description: 'Number of materials using this unit as their BASE UNIT',
    example: 3,
  })
  asBaseUnit: number;

  @ApiProperty({
    description: 'Number of materials declaring this unit as a CONVERSION UNIT',
    example: 7,
  })
  asConversionUnit: number;

  @ApiProperty({
    description: 'Total number of DISTINCT materials using this unit (in any way)',
    example: 9,
  })
  total: number;
}

export class UnitResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({
    type: UnitMaterialCountDto,
    description: 'Number of materials currently using this unit',
  })
  materialCount?: UnitMaterialCountDto;
}
