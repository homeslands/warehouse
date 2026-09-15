import { IsInt, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateMaterialTypeRequestDto extends CreateMaterialTypeRequestDto {
  @ApiProperty({ description: 'Version nhận được từ lần GET gần nhất, dùng để phát hiện xung đột' })
  @IsNotEmpty({ message: 'MATERIAL_TYPE_VERSION_IS_REQUIRED' })
  @IsInt({ message: 'MATERIAL_TYPE_VERSION_IS_REQUIRED' })
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
