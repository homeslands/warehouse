import { IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { BUSINESS_CODE_REGEX } from 'src/shared/utils/code.util';

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
  @Matches(BUSINESS_CODE_REGEX, { message: 'UNIT_CODE_INVALID' })
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
    description: 'Filter by name (chứa chuỗi con, không phân biệt hoa/thường)',
  })
  @IsOptional()
  @Transform(trim)
  name?: string;
}

export class UnitMaterialCountDto {
  @ApiProperty({ description: 'Số vật tư lấy đơn vị này làm ĐƠN VỊ CƠ SỞ', example: 3 })
  asBaseUnit: number;

  @ApiProperty({ description: 'Số vật tư khai đơn vị này là ĐƠN VỊ QUY ĐỔI', example: 7 })
  asConversionUnit: number;

  @ApiProperty({
    description: 'Tổng số vật tư DUY NHẤT dùng đơn vị này (theo bất kỳ đường nào)',
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
    description: 'Số vật tư đang dùng đơn vị này',
  })
  materialCount?: UnitMaterialCountDto;
}
