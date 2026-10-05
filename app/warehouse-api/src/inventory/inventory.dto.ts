import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { IsDecimalWithScale } from 'src/shared/utils/decimal.validator';
import { InventoryHistoryAction } from './inventory.constants';

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

export class AssignInventoryRequestDto {
  @ApiProperty({ description: 'Slug của vật tư cần gán vào kho', example: 'x7fk2p9qab' })
  @Transform(trim)
  @IsNotEmpty({ message: 'INVENTORY_SLUG_IS_REQUIRED' })
  materialSlug: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Tồn ban đầu (theo đơn vị cơ sở)', default: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'INVENTORY_QUANTITY_INVALID' })
  @Min(0, { message: 'INVENTORY_QUANTITY_INVALID' })
  quantity?: number = 0;

  @ApiPropertyOptional({
    description: 'Ngưỡng tối thiểu riêng của kho này. `null`/bỏ trống = theo Material.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('INVENTORY_MINIMUM_INVENTORY_INVALID')
  minimumInventory?: number | null;

  @ApiPropertyOptional({
    description: 'Ngưỡng tối đa riêng của kho này. `null`/bỏ trống = theo Material.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('INVENTORY_MAXIMUM_INVENTORY_INVALID')
  maximumInventory?: number | null;
}

/** Chỉ sửa ngưỡng override — cố ý KHÔNG nhận `quantity` (đi qua `PATCH .../quantity`). */
export class UpdateInventoryRequestDto {
  @ApiPropertyOptional({
    description: 'Gửi `null` để bỏ override và quay về ngưỡng của Material.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('INVENTORY_MINIMUM_INVENTORY_INVALID')
  minimumInventory?: number | null;

  @ApiPropertyOptional({
    description: 'Gửi `null` để bỏ override và quay về ngưỡng của Material.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('INVENTORY_MAXIMUM_INVENTORY_INVALID')
  maximumInventory?: number | null;
}

export class AdjustInventoryQuantityRequestDto {
  @ApiProperty({
    description:
      'Số lượng cộng (dương) hoặc trừ (âm) vào tồn hiện tại, theo ĐƠN VỊ CƠ SỞ. Không nhận 0.',
    example: 5,
  })
  @Type(() => Number)
  // Cho phép số lẻ (tồn là DECIMAL(18,6)); dấu âm hợp lệ vì đây là delta.
  @IsDecimalWithScale(6, { message: 'INVENTORY_DELTA_INVALID' })
  @IsNotEmpty({ message: 'INVENTORY_DELTA_INVALID' })
  delta: number;

  @ApiPropertyOptional({ description: 'Ghi chú, lưu vào lịch sử tồn kho', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'INVENTORY_NOTE_INVALID' })
  @MaxLength(255, { message: 'INVENTORY_NOTE_INVALID' })
  note?: string;
}

export class GetInventoryRequestDto extends BaseQueryDto {
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

export class InventoryResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ description: 'Tồn thực tế trong kho này, theo đơn vị cơ sở của vật tư' })
  quantity: number;

  @AutoMap()
  @ApiProperty({ description: 'Lượng đã giữ chỗ cho phiếu xuất chưa hoàn tất' })
  reservedQuantity: number;

  @ApiProperty({ description: 'Lượng còn xuất được = quantity - reservedQuantity' })
  availableQuantity: number;

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

export class GetInventoryHistoryRequestDto extends BaseQueryDto {}

/** 1 dòng lịch sử tồn kho, mới nhất trước. Mọi số lượng theo đơn vị cơ sở của vật tư. */
export class InventoryHistoryResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ enum: InventoryHistoryAction })
  action: InventoryHistoryAction;

  @AutoMap()
  @ApiProperty({ description: 'Lượng cộng (dương) / trừ (âm) vào quantity' })
  quantityDelta: number;

  @AutoMap()
  @ApiProperty()
  quantityBefore: number;

  @AutoMap()
  @ApiProperty()
  quantityAfter: number;

  @AutoMap()
  @ApiProperty({ description: 'Lượng cộng (dương) / trừ (âm) vào reservedQuantity' })
  reservedDelta: number;

  @AutoMap()
  @ApiProperty()
  reservedBefore: number;

  @AutoMap()
  @ApiProperty()
  reservedAfter: number;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;

  @ApiPropertyOptional({ description: 'Slug của người thao tác' })
  changedBySlug?: string;

  @ApiPropertyOptional({ description: 'Họ tên người thao tác' })
  changedByName?: string;
}
