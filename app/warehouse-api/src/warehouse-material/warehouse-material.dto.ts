import { IsBoolean, IsNotEmpty, IsOptional, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { IsDecimalWithScale } from 'src/shared/utils/decimal.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/**
 * `null` là giá trị HỢP LỆ và có nghĩa riêng ("bỏ override, quay về ngưỡng của Material"), nên
 * không dùng `@IsOptional()` (nó nuốt luôn `null`) mà `@ValidateIf(... !== null)` để phân biệt
 * "không gửi field" với "gửi null".
 */
const OverrideThreshold = (message: string) => (target: object, key: string) => {
  IsOptional()(target, key);
  ValidateIf((o: Record<string, unknown>) => o[key] !== null && o[key] !== undefined)(target, key);
  Type(() => Number)(target, key);
  // DECIMAL(18,6) từ migration `1783728000021` — ngưỡng phải cùng kiểu với tồn để so sánh được.
  IsDecimalWithScale(6, { message })(target, key);
  Min(0, { message })(target, key);
};

export class AssignWarehouseMaterialRequestDto {
  @ApiProperty({ description: 'Slug của vật tư cần gán vào kho', example: 'x7fk2p9qab' })
  @Transform(trim)
  @IsNotEmpty({ message: 'WAREHOUSE_MATERIAL_SLUG_IS_REQUIRED' })
  materialSlug: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Tồn ban đầu (theo đơn vị cơ sở)', default: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'WAREHOUSE_MATERIAL_QUANTITY_INVALID' })
  @Min(0, { message: 'WAREHOUSE_MATERIAL_QUANTITY_INVALID' })
  quantity?: number = 0;

  @ApiPropertyOptional({
    description: 'Ngưỡng tối thiểu riêng của kho này. `null`/bỏ trống = theo Material.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('WAREHOUSE_MATERIAL_MINIMUM_INVENTORY_INVALID')
  minimumInventory?: number | null;

  @ApiPropertyOptional({
    description: 'Ngưỡng tối đa riêng của kho này. `null`/bỏ trống = theo Material.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('WAREHOUSE_MATERIAL_MAXIMUM_INVENTORY_INVALID')
  maximumInventory?: number | null;
}

/** Chỉ sửa ngưỡng override — cố ý KHÔNG nhận `quantity` (đi qua `PATCH .../quantity`). */
export class UpdateWarehouseMaterialRequestDto {
  @ApiPropertyOptional({
    description: 'Gửi `null` để bỏ override và quay về ngưỡng của Material.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('WAREHOUSE_MATERIAL_MINIMUM_INVENTORY_INVALID')
  minimumInventory?: number | null;

  @ApiPropertyOptional({
    description: 'Gửi `null` để bỏ override và quay về ngưỡng của Material.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('WAREHOUSE_MATERIAL_MAXIMUM_INVENTORY_INVALID')
  maximumInventory?: number | null;
}

export class AdjustWarehouseMaterialQuantityRequestDto {
  @ApiProperty({
    description:
      'Số lượng cộng (dương) hoặc trừ (âm) vào tồn hiện tại, theo ĐƠN VỊ CƠ SỞ. Không nhận 0.',
    example: 5,
  })
  @Type(() => Number)
  // Cho phép số lẻ (tồn là DECIMAL(18,6)); dấu âm hợp lệ vì đây là delta.
  @IsDecimalWithScale(6, { message: 'WAREHOUSE_MATERIAL_DELTA_INVALID' })
  @IsNotEmpty({ message: 'WAREHOUSE_MATERIAL_DELTA_INVALID' })
  delta: number;
}

export class GetWarehouseMaterialRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo slug của loại vật tư' })
  @IsOptional()
  @Transform(trim)
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'true = chỉ lấy dòng đang dưới ngưỡng tối thiểu' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  belowMinimum?: boolean;

  @ApiPropertyOptional({ description: 'true = chỉ lấy dòng đang vượt ngưỡng tối đa' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  aboveMaximum?: boolean;
}

export class WarehouseMaterialResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ description: 'Tồn thực tế trong kho này, theo đơn vị cơ sở của vật tư' })
  quantity: number;

  @ApiPropertyOptional({
    description: 'Override ngưỡng tối thiểu, null = theo Material',
    nullable: true,
  })
  minimumInventory?: number | null;

  @ApiPropertyOptional({
    description: 'Override ngưỡng tối đa, null = theo Material',
    nullable: true,
  })
  maximumInventory?: number | null;

  @ApiProperty({ description: 'Ngưỡng tối thiểu thật sự đang áp = override ?? của Material' })
  effectiveMinimumInventory: number;

  @ApiProperty({ description: 'Ngưỡng tối đa thật sự đang áp = override ?? của Material' })
  effectiveMaximumInventory: number;

  @ApiProperty({ description: 'quantity < effectiveMinimumInventory' })
  isBelowMinimum: boolean;

  @ApiProperty({ description: 'quantity > effectiveMaximumInventory' })
  isAboveMaximum: boolean;

  @ApiPropertyOptional({ description: 'Slug của kho' })
  warehouseSlug?: string;

  @ApiPropertyOptional({ description: 'Slug của vật tư' })
  materialSlug?: string;

  @ApiPropertyOptional({ description: 'Mã vật tư' })
  materialCode?: string;

  @ApiPropertyOptional({ description: 'Tên vật tư' })
  materialName?: string;

  @ApiPropertyOptional({ description: 'Slug loại vật tư' })
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Tên loại vật tư' })
  typeName?: string;
}
