import { IsEnum, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseResponseDto, PaginationQueryDto } from 'src/app/base.dto';
import { BUSINESS_CODE_REGEX } from 'src/shared/utils/code.util';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateMaterialTypeRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The name of material type', example: 'Consumables' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_TYPE_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'The business code of material type', example: 'MT-01' })
  @Transform(trim)
  @Matches(BUSINESS_CODE_REGEX, { message: 'MATERIAL_TYPE_CODE_INVALID' })
  @IsNotEmpty({ message: 'MATERIAL_TYPE_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The description of material type' })
  @IsOptional()
  @Transform(trim)
  description?: string;
}

/**
 * PATCH đúng nghĩa REST: mọi field nghiệp vụ đều optional, field nào không gửi thì giữ nguyên giá
 * trị cũ (`PartialType` gắn `@IsOptional()` lên toàn bộ field thừa hưởng, validator vẫn chạy khi
 * field CÓ mặt).
 */
export class UpdateMaterialTypeRequestDto extends PartialType(CreateMaterialTypeRequestDto) {}

/** Field sắp xếp của `GET /material-types` — map sang cột ở `buildSortOrder()` trong service. */
export enum MaterialTypeSortBy {
  CreatedAt = 'createdAt',
  Name = 'name',
  Code = 'code',
}

export class GetAllMaterialTypeRequestDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by exact business code', example: 'MT-01' })
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

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: MaterialTypeSortBy,
    default: MaterialTypeSortBy.CreatedAt,
  })
  @IsOptional()
  @IsEnum(MaterialTypeSortBy, { message: 'SORT_BY_INVALID' })
  sortBy?: MaterialTypeSortBy = MaterialTypeSortBy.CreatedAt;
}

export class MaterialTypeResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiPropertyOptional()
  description?: string;
}
