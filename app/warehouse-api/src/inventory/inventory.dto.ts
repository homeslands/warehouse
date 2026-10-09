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
  @ApiProperty({
    description: 'Slug of the material to assign to the warehouse',
    example: 'x7fk2p9qab',
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'INVENTORY_SLUG_IS_REQUIRED' })
  materialSlug: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Initial stock (in the base unit)', default: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'INVENTORY_QUANTITY_INVALID' })
  @Min(0, { message: 'INVENTORY_QUANTITY_INVALID' })
  quantity?: number = 0;

  @ApiPropertyOptional({
    description:
      'Minimum threshold specific to this warehouse. `null`/omitted = use the Material value.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('INVENTORY_MINIMUM_INVENTORY_INVALID')
  minimumInventory?: number | null;

  @ApiPropertyOptional({
    description:
      'Maximum threshold specific to this warehouse. `null`/omitted = use the Material value.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('INVENTORY_MAXIMUM_INVENTORY_INVALID')
  maximumInventory?: number | null;
}

/** Chỉ sửa ngưỡng override — cố ý KHÔNG nhận `quantity` (đi qua `PATCH .../quantity`). */
export class UpdateInventoryRequestDto {
  @ApiPropertyOptional({
    description: 'Send `null` to drop the override and fall back to the Material threshold.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('INVENTORY_MINIMUM_INVENTORY_INVALID')
  minimumInventory?: number | null;

  @ApiPropertyOptional({
    description: 'Send `null` to drop the override and fall back to the Material threshold.',
    nullable: true,
    type: Number,
  })
  @OverrideThreshold('INVENTORY_MAXIMUM_INVENTORY_INVALID')
  maximumInventory?: number | null;
}

export class AdjustInventoryQuantityRequestDto {
  @ApiProperty({
    description:
      'Amount to add (positive) to or subtract (negative) from current stock, in the BASE UNIT. ' +
      '0 is not accepted.',
    example: 5,
  })
  @Type(() => Number)
  // Cho phép số lẻ (tồn là DECIMAL(18,6)); dấu âm hợp lệ vì đây là delta.
  @IsDecimalWithScale(6, { message: 'INVENTORY_DELTA_INVALID' })
  @IsNotEmpty({ message: 'INVENTORY_DELTA_INVALID' })
  delta: number;

  @ApiPropertyOptional({ description: 'Note, saved to the inventory history', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'INVENTORY_NOTE_INVALID' })
  @MaxLength(255, { message: 'INVENTORY_NOTE_INVALID' })
  note?: string;
}

export class GetInventoryRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by material type slug' })
  @IsOptional()
  @Transform(trim)
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'true = only rows currently below the minimum threshold' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  belowMinimum?: boolean;

  @ApiPropertyOptional({ description: 'true = only rows currently above the maximum threshold' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  aboveMaximum?: boolean;
}

export class InventoryResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ description: 'Actual stock in this warehouse, in the material base unit' })
  quantity: number;

  @AutoMap()
  @ApiProperty({ description: 'Quantity reserved for export forms not yet completed' })
  reservedQuantity: number;

  @ApiProperty({ description: 'Quantity still available to export = quantity - reservedQuantity' })
  availableQuantity: number;

  @ApiPropertyOptional({
    description: 'Minimum threshold override, null = use the Material value',
    nullable: true,
  })
  minimumInventory?: number | null;

  @ApiPropertyOptional({
    description: 'Maximum threshold override, null = use the Material value',
    nullable: true,
  })
  maximumInventory?: number | null;

  @ApiProperty({ description: 'Minimum threshold actually in effect = override ?? Material value' })
  effectiveMinimumInventory: number;

  @ApiProperty({ description: 'Maximum threshold actually in effect = override ?? Material value' })
  effectiveMaximumInventory: number;

  @ApiProperty({ description: 'quantity < effectiveMinimumInventory' })
  isBelowMinimum: boolean;

  @ApiProperty({ description: 'quantity > effectiveMaximumInventory' })
  isAboveMaximum: boolean;

  @ApiPropertyOptional({ description: 'Warehouse slug' })
  warehouseSlug?: string;

  @ApiPropertyOptional({ description: 'Material slug' })
  materialSlug?: string;

  @ApiPropertyOptional({ description: 'Material code' })
  materialCode?: string;

  @ApiPropertyOptional({ description: 'Material name' })
  materialName?: string;

  @ApiPropertyOptional({ description: 'Material type slug' })
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Material type name' })
  typeName?: string;
}

export class GetInventoryHistoryRequestDto extends BaseQueryDto {}

/** 1 dòng lịch sử tồn kho, mới nhất trước. Mọi số lượng theo đơn vị cơ sở của vật tư. */
export class InventoryHistoryResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ enum: InventoryHistoryAction })
  action: InventoryHistoryAction;

  @AutoMap()
  @ApiProperty({ description: 'Amount added (positive) to / subtracted (negative) from quantity' })
  quantityDelta: number;

  @AutoMap()
  @ApiProperty()
  quantityBefore: number;

  @AutoMap()
  @ApiProperty()
  quantityAfter: number;

  @AutoMap()
  @ApiProperty({
    description: 'Amount added (positive) to / subtracted (negative) from reservedQuantity',
  })
  reservedDelta: number;

  @AutoMap()
  @ApiProperty()
  reservedBefore: number;

  @AutoMap()
  @ApiProperty()
  reservedAfter: number;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;

  @ApiPropertyOptional({ description: 'Slug of the user who made the change' })
  changedBySlug?: string;

  @ApiPropertyOptional({ description: 'Full name of the user who made the change' })
  changedByName?: string;
}
