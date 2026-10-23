import { IsEnum, IsISO8601, IsOptional, IsString, Matches } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { IMPORT_FORM_DATE_REGEX } from 'src/import-form/import-form.constants';
import { MaterialBatchStatus } from './material-batch.constants';
import { MaterialTypeResponseDto } from 'src/material-type/material-type.dto';
import { UnitResponseDto } from 'src/unit/unit.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Field sắp xếp của `GET .../material-batches` — map sang cột ở `buildSortOrder()` trong service. */
export enum MaterialBatchSortBy {
  CreatedAt = 'createdAt',
  ExpiryDate = 'expiryDate',
  EntryDate = 'entryDate',
}

export class GetAllMaterialBatchRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by the slug of the material (exact match)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  materialSlug?: string;

  @ApiPropertyOptional({
    enum: MaterialBatchStatus,
    description: '0 = out of stock, 1 = in stock',
  })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(MaterialBatchStatus, { message: 'MATERIAL_BATCH_STATUS_INVALID' })
  status?: MaterialBatchStatus;

  @ApiPropertyOptional({
    description:
      'Only batches expiring strictly before this date (YYYY-MM-DD). Batches without an expiry ' +
      'date are excluded',
    example: '2026-12-31',
  })
  @IsOptional()
  @Transform(trim)
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'MATERIAL_BATCH_EXPIRY_BEFORE_INVALID' },
  )
  @Matches(IMPORT_FORM_DATE_REGEX, { message: 'MATERIAL_BATCH_EXPIRY_BEFORE_INVALID' })
  expiryBefore?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: MaterialBatchSortBy,
    default: MaterialBatchSortBy.CreatedAt,
  })
  @IsOptional()
  @IsEnum(MaterialBatchSortBy, { message: 'SORT_BY_INVALID' })
  sortBy?: MaterialBatchSortBy = MaterialBatchSortBy.CreatedAt;
}

/** Vật tư của lô, kèm loại và đơn vị cơ sở (đơn vị của `quantity`/`remainingQuantity`). */
export class MaterialBatchMaterialResponseDto {
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
    description: 'Base unit — the unit of quantity/remainingQuantity. null if not set',
  })
  baseUnit?: UnitResponseDto | null;
}

export class MaterialBatchResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ example: '2026-10-12' })
  entryDate: string;

  @AutoMap()
  @ApiPropertyOptional({ example: '2027-10-12', description: 'null = no expiry date' })
  expiryDate?: string | null;

  @AutoMap()
  @ApiProperty({ description: 'Quantity received, in the material base unit' })
  quantity: number;

  @AutoMap()
  @ApiProperty({ description: 'Quantity left, in the material base unit' })
  remainingQuantity: number;

  @AutoMap()
  @ApiProperty({ enum: MaterialBatchStatus, description: '0 = out of stock, 1 = in stock' })
  status: MaterialBatchStatus;

  @ApiProperty()
  materialSlug: string;

  @ApiProperty()
  materialCode: string;

  @ApiProperty()
  materialName: string;

  @ApiProperty({ type: MaterialBatchMaterialResponseDto })
  material: MaterialBatchMaterialResponseDto;

  @ApiProperty()
  warehouseSlug: string;

  @ApiPropertyOptional({ description: 'Slug of the import form the batch came from' })
  importFormSlug?: string | null;

  @ApiPropertyOptional({ description: 'Code of the import form the batch came from' })
  importFormCode?: string | null;
}
