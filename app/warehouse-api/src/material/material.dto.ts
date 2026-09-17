import { IsInt, IsNotEmpty, IsOptional, Matches, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, VersionedResponseDto } from 'src/app/base.dto';
import { BUSINESS_CODE_REGEX } from 'src/shared/utils/code.util';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateMaterialRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The business code of material', example: 'MAT-001' })
  @Transform(trim)
  @Matches(BUSINESS_CODE_REGEX, { message: 'MATERIAL_CODE_INVALID' })
  @IsNotEmpty({ message: 'MATERIAL_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiProperty({ description: 'The name of material', example: 'Găng tay cao su' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_NAME_IS_REQUIRED' })
  name: string;

  @ApiProperty({ description: 'Slug của MaterialType', example: 'x7fk2p9qab' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_TYPE_SLUG_IS_REQUIRED' })
  typeSlug: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Ngưỡng tồn tối thiểu mặc định', default: 0, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  minimumInventory?: number = 0;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Ngưỡng tồn tối đa mặc định', default: 0, example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'MATERIAL_MAXIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MAXIMUM_INVENTORY_INVALID' })
  maximumInventory?: number = 0;
}

export class UpdateMaterialRequestDto extends CreateMaterialRequestDto {
  @ApiProperty({
    description: 'Version nhận được từ lần GET gần nhất, dùng để phát hiện xung đột',
    minimum: 1,
  })
  @IsNotEmpty({ message: 'MATERIAL_VERSION_IS_REQUIRED' })
  @IsInt({ message: 'MATERIAL_VERSION_IS_REQUIRED' })
  // `@Min(1)`: TypeORM bọc cả khối so sánh version của optimistic lock trong
  // `if (result && lockMode === 'optimistic' && lockVersion)` (`SelectQueryBuilder.js:691-693`) —
  // `0` là falsy nên `version: 0` khiến check KHÔNG chạy và `save()` ghi đè vô điều kiện, chỉ với 1
  // request. `@IsNotEmpty`/`@IsInt` đều cho `0` qua; `@VersionColumn` luôn bắt đầu từ 1.
  @Min(1, { message: 'MATERIAL_VERSION_IS_REQUIRED' })
  version: number;
}

export class GetAllMaterialRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by the slug of the material type' })
  @IsOptional()
  @Transform(trim)
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Filter by exact business code', example: 'MAT-001' })
  @IsOptional()
  @Transform(upper)
  code?: string;

  @ApiPropertyOptional({ description: 'Filter by name (chứa chuỗi con)' })
  @IsOptional()
  @Transform(trim)
  name?: string;
}

export class MaterialResponseDto extends VersionedResponseDto {
  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  minimumInventory: number;

  @AutoMap()
  @ApiProperty()
  maximumInventory: number;

  // Flatten từ quan hệ `type` bằng `forMember` — không lồng nguyên `MaterialTypeResponseDto` vào.
  @ApiPropertyOptional({ description: 'Slug của loại vật tư' })
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Mã loại vật tư' })
  typeCode?: string;

  @ApiPropertyOptional({ description: 'Tên loại vật tư' })
  typeName?: string;
}
