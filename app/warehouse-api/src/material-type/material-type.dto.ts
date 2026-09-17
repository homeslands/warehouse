import { IsInt, IsNotEmpty, IsOptional, Matches, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, VersionedResponseDto } from 'src/app/base.dto';
import { BUSINESS_CODE_REGEX } from 'src/shared/utils/code.util';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateMaterialTypeRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The name of material type', example: 'Vật tư tiêu hao' })
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
 * field CÓ mặt). Chỉ `version` là bắt buộc — nó không phải dữ liệu nghiệp vụ mà là điều kiện của
 * optimistic lock.
 */
export class UpdateMaterialTypeRequestDto extends PartialType(CreateMaterialTypeRequestDto) {
  @ApiProperty({
    description: 'Version nhận được từ lần GET gần nhất, dùng để phát hiện xung đột',
    minimum: 1,
  })
  @IsNotEmpty({ message: 'MATERIAL_TYPE_VERSION_IS_REQUIRED' })
  @IsInt({ message: 'MATERIAL_TYPE_VERSION_IS_REQUIRED' })
  // `@Min(1)`: TypeORM bọc cả khối so sánh version của optimistic lock trong
  // `if (result && lockMode === 'optimistic' && lockVersion)` (`SelectQueryBuilder.js:691-693`) —
  // `0` là falsy nên `version: 0` khiến check KHÔNG chạy và `save()` ghi đè vô điều kiện, chỉ với 1
  // request. `@IsNotEmpty`/`@IsInt` đều cho `0` qua; `@VersionColumn` luôn bắt đầu từ 1.
  @Min(1, { message: 'MATERIAL_TYPE_VERSION_IS_REQUIRED' })
  version: number;
}

export class GetAllMaterialTypeRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by exact business code', example: 'MT-01' })
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

export class MaterialTypeResponseDto extends VersionedResponseDto {
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
