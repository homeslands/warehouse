import { IsEnum, IsISO8601, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { IMPORT_FORM_DATE_REGEX } from 'src/import-form/import-form.constants';
import { ItemStatus } from './item.constants';
import { MaterialTypeResponseDto } from 'src/material-type/material-type.dto';
import { UnitResponseDto } from 'src/unit/unit.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Field sắp xếp của `GET .../items` — map sang cột ở `buildSortOrder()` trong service. */
export enum ItemSortBy {
  CreatedAt = 'createdAt',
  ExpiryDate = 'expiryDate',
  EntryDate = 'entryDate',
}

export class GetAllItemRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by the item code (exact match, e.g. a scanned label)',
    example: 'IT-WH-001-261126-000001',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Filter by the slug of the material (exact match)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  materialSlug?: string;

  @ApiPropertyOptional({ enum: ItemStatus, description: 'Filter by item status' })
  @IsOptional()
  @Transform(trim)
  @IsEnum(ItemStatus, { message: 'ITEM_STATUS_INVALID' })
  status?: ItemStatus;

  @ApiPropertyOptional({
    description:
      'Only items expiring strictly before this date (YYYY-MM-DD). Items without an expiry ' +
      'date are excluded',
    example: '2026-12-31',
  })
  @IsOptional()
  @Transform(trim)
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'ITEM_EXPIRY_BEFORE_INVALID' })
  @Matches(IMPORT_FORM_DATE_REGEX, { message: 'ITEM_EXPIRY_BEFORE_INVALID' })
  expiryBefore?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ItemSortBy,
    default: ItemSortBy.CreatedAt,
  })
  @IsOptional()
  @IsEnum(ItemSortBy, { message: 'SORT_BY_INVALID' })
  sortBy?: ItemSortBy = ItemSortBy.CreatedAt;
}

/** Vật tư của item, kèm loại và đơn vị cơ sở (đơn vị của `baseQuantity`/`remainingQuantity`). */
export class ItemMaterialResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ type: MaterialTypeResponseDto, description: 'Material type' })
  type?: MaterialTypeResponseDto | null;

  @ApiPropertyOptional({
    type: UnitResponseDto,
    nullable: true,
    description: 'Base unit — the unit of baseQuantity/remainingQuantity. null if not set',
  })
  baseUnit?: UnitResponseDto | null;
}

export class ItemResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiPropertyOptional({
    description: 'Code of this unit of goods (null for legacy items)',
    example: 'IT-WH-001-261126-000001',
  })
  code?: string | null;

  @AutoMap()
  @ApiProperty({ description: 'Line number in the import form (1-based)' })
  lineNo: number;

  @AutoMap()
  @ApiProperty({ example: '2026-10-12', description: 'Date of the import form' })
  entryDate: string;

  @AutoMap()
  @ApiPropertyOptional({ example: '2027-10-12', description: 'null = no expiry date' })
  expiryDate?: string | null;

  @AutoMap()
  @ApiProperty({ description: 'Quantity in the given unit (always 1, except legacy items)' })
  quantity: number;

  @ApiProperty()
  unitSlug: string;

  @AutoMap()
  @ApiProperty()
  unitCode: string;

  @AutoMap()
  @ApiProperty()
  unitName: string;

  @AutoMap()
  @ApiProperty({ description: 'Base units in 1 given unit, snapshotted when the item was added' })
  conversionRate: number;

  @AutoMap()
  @ApiProperty({ description: 'quantity × conversionRate, in the material base unit' })
  baseQuantity: number;

  @AutoMap()
  @ApiProperty({ description: 'Quantity left, in the material base unit' })
  remainingQuantity: number;

  @AutoMap()
  @ApiProperty({
    description: 'Quantity held by DRAFT/PENDING export forms, in the material base unit',
  })
  reservedQuantity: number;

  @ApiProperty({
    description:
      'remainingQuantity - reservedQuantity: what a new export form can still take (0 unless ' +
      'the item is IN_STOCK/RESERVED)',
  })
  availableQuantity: number;

  @AutoMap()
  @ApiProperty({ enum: ItemStatus, description: 'Lifecycle status of the item' })
  status: ItemStatus;

  @AutoMap()
  @ApiProperty()
  unitPrice: number;

  @AutoMap()
  @ApiProperty({ description: 'quantity × unitPrice' })
  amount: number;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Supplier snapshotted when the item was added' })
  supplierSlug?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  supplierCode?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  supplierName?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  note?: string | null;

  @ApiProperty()
  materialSlug: string;

  @AutoMap()
  @ApiProperty()
  materialCode: string;

  @AutoMap()
  @ApiProperty()
  materialName: string;

  @ApiProperty({ type: ItemMaterialResponseDto })
  material: ItemMaterialResponseDto;

  @ApiProperty()
  warehouseSlug: string;

  @ApiProperty({ description: 'Slug of the import form the item came from' })
  importFormSlug: string;

  @ApiProperty({ description: 'Code of the import form the item came from' })
  importFormCode: string;
}
