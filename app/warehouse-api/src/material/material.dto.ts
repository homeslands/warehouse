import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { BUSINESS_CODE_REGEX } from 'src/shared/utils/code.util';
import { IsDecimalWithScale } from 'src/shared/utils/decimal.validator';
import { SEARCH_CODE_REGEX, SEARCH_TEXT_REGEX } from 'src/shared/utils/query.util';
import { MaterialTypeResponseDto } from 'src/material-type/material-type.dto';
import { UnitResponseDto } from 'src/unit/unit.dto';
import { SupplierResponseDto } from 'src/supplier/supplier.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateMaterialRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The business code of material', example: 'MAT-001' })
  @Transform(trim)
  @Matches(BUSINESS_CODE_REGEX, { message: 'MATERIAL_CODE_INVALID' })
  @IsNotEmpty({ message: 'MATERIAL_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiProperty({ description: 'The name of material', example: 'Rubber gloves' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_NAME_IS_REQUIRED' })
  name: string;

  @ApiProperty({ description: 'Slug of the MaterialType', example: 'x7fk2p9qab' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_TYPE_SLUG_IS_REQUIRED' })
  typeSlug: string;

  /**
   * Slug của `Unit` làm ĐƠN VỊ CƠ SỞ — bắt buộc khi tạo mới: không có base unit thì vật tư không gắn
   * được đơn vị quy đổi, không quy đổi được số lượng. Cột `base_unit_id_column` dưới DB vẫn NULL-able
   * (migration `1783728000020`) chỉ vì vật tư cũ tạo trước đó; `@IsNotEmpty` chặn cả thiếu lẫn `null`.
   * PATCH vẫn optional (qua `PartialType`), nhưng gửi thì không được rỗng.
   *
   * Cố ý KHÔNG `@AutoMap()`: quan hệ `baseUnit` do service resolve ra entity thật rồi gán, mapper
   * đụng vào sẽ ghi đè thành `undefined` (cùng cách xử lý `typeSlug`).
   */
  @ApiProperty({ description: 'Slug of the base unit (Unit)', example: 'unit-abc123' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED' })
  baseUnitSlug: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Default minimum inventory threshold',
    default: 0,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  minimumInventory?: number = 0;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Default maximum inventory threshold',
    default: 0,
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_MAXIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MAXIMUM_INVENTORY_INVALID' })
  maximumInventory?: number = 0;
}

/**
 * PATCH đúng nghĩa REST: mọi field nghiệp vụ đều optional, field nào không gửi thì giữ nguyên giá
 * trị cũ (`PartialType` gắn `@IsOptional()` lên toàn bộ field thừa hưởng, validator vẫn chạy khi
 * field CÓ mặt).
 */
export class UpdateMaterialRequestDto extends PartialType(CreateMaterialRequestDto) {
  // `PartialType` sao chép cả property initializer của DTO cha (`= 0`), nên PATCH không gửi ngưỡng
  // tồn sẽ âm thầm reset nó về 0. Khai lại (kèm nguyên decorator, thiếu `@AutoMap()` là automapper
  // bỏ luôn field) và gán `undefined` để huỷ initializer — target ES2021 +
  // `useDefineForClassFields: false` ⇒ gán ở lớp con chạy sau constructor lớp cha.
  @AutoMap()
  @ApiPropertyOptional({ description: 'Default minimum inventory threshold', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  override minimumInventory?: number = undefined;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Default maximum inventory threshold', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_MAXIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MAXIMUM_INVENTORY_INVALID' })
  override maximumInventory?: number = undefined;
}

/** Field sắp xếp của `GET /materials` — map sang cột ở `buildSortOrder()` trong service. */
export enum MaterialSortBy {
  CreatedAt = 'createdAt',
  Name = 'name',
  Code = 'code',
}

export class GetAllMaterialRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by the slug of the material type' })
  @IsOptional()
  @Transform(trim)
  typeSlug?: string;

  @ApiPropertyOptional({
    description: 'Filter by business code (prefix match, case-insensitive)',
    example: 'MAT-',
  })
  @IsOptional()
  @Transform(upper)
  @Matches(SEARCH_CODE_REGEX, { message: 'MATERIAL_CODE_SEARCH_INVALID' })
  code?: string;

  @ApiPropertyOptional({
    description:
      'Filter by name (prefix match). Letters (Vietnamese included), digits and spaces only',
    example: 'Găng tay',
  })
  @IsOptional()
  @Transform(trim)
  @Matches(SEARCH_TEXT_REGEX, { message: 'MATERIAL_NAME_SEARCH_INVALID' })
  name?: string;

  @ApiPropertyOptional({
    description: 'true = attached to a supplier, false = not attached to any supplier',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'MATERIAL_HAS_SUPPLIER_INVALID' })
  hasSupplier?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by the slug of the supplier (takes precedence over `hasSupplier`)',
  })
  @IsOptional()
  @Transform(trim)
  supplierSlug?: string;

  @ApiPropertyOptional({ description: 'Only materials assigned to this warehouse' })
  @IsOptional()
  @Transform(trim)
  warehouseSlug?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: MaterialSortBy,
    default: MaterialSortBy.CreatedAt,
  })
  @IsOptional()
  @IsEnum(MaterialSortBy, { message: 'SORT_BY_INVALID' })
  sortBy?: MaterialSortBy = MaterialSortBy.CreatedAt;
}

/** 1 kho mà vật tư đã được gán vào (1 dòng `inventory_tbl`), kèm tồn theo đơn vị cơ sở. */
export class MaterialWarehouseResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Stock in this warehouse, in the base unit' })
  quantity: number;

  @ApiProperty({ description: 'quantity - reservedQuantity' })
  availableQuantity: number;
}

export class MaterialConversionUnitResponseDto {
  @ApiProperty({ example: 'unit-abc123' })
  unitSlug: string;

  @ApiProperty({ example: 'BAG' })
  unitCode: string;

  @ApiProperty({ example: 'Bag 50kg' })
  unitName: string;

  @ApiProperty({ type: UnitResponseDto, description: 'The unit object' })
  unit: UnitResponseDto;

  @AutoMap()
  @ApiProperty({ description: 'Number of base units in 1 of this unit', example: 50 })
  conversionRate: number;

  // Đơn vị cơ sở nay cũng là 1 dòng của bảng join (rate = 1) nên nó nằm trong CHÍNH danh sách này —
  // client cần cờ để hiển thị khác đi và để biết dòng nào không sửa/gỡ được.
  @ApiProperty({ description: 'Whether this row is the BASE UNIT of the material', example: false })
  isBaseUnit: boolean;
}

export class MaterialResponseDto extends BaseResponseDto {
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

  @ApiPropertyOptional({ type: MaterialTypeResponseDto, description: 'Material type' })
  type?: MaterialTypeResponseDto;

  @ApiPropertyOptional({
    type: UnitResponseDto,
    nullable: true,
    description: 'Base unit — `null` when the material has no base unit yet',
  })
  baseUnit?: UnitResponseDto | null;

  @ApiProperty({ description: 'Whether the material is attached to at least one supplier' })
  hasSupplier: boolean;

  @ApiProperty({
    type: [SupplierResponseDto],
    description: 'Suppliers of the material (empty when `hasSupplier` is false)',
  })
  suppliers: SupplierResponseDto[];

  @ApiProperty({
    type: [MaterialWarehouseResponseDto],
    description: 'Warehouses the material is assigned to (empty when none)',
  })
  warehouses: MaterialWarehouseResponseDto[];

  @ApiProperty({
    type: [MaterialConversionUnitResponseDto],
    description:
      'Units of the material with conversion rates — base unit first (`isBaseUnit`), the rest by ' +
      'unit code. Empty when the material has no unit yet',
  })
  units: MaterialConversionUnitResponseDto[];
}

/** Số nhà cung cấp tối đa gắn cho 1 vật tư trong 1 lần `PUT /materials/:slug/suppliers`. */
export const MATERIAL_SUPPLIER_MAX = 50;

/**
 * Body của `PUT /materials/:slug/suppliers` — THAY toàn bộ tập nhà cung cấp của vật tư (PUT đúng
 * nghĩa): nhà cung cấp không có trong mảng bị gỡ, mảng rỗng = gỡ hết. Slug được trim + khử trùng lặp
 * trước khi validate.
 */
export class AssignMaterialSuppliersRequestDto {
  @ApiProperty({
    type: [String],
    description: `Supplier slugs (0-${MATERIAL_SUPPLIER_MAX}); empty array detaches every supplier`,
    example: ['sup-slug-1', 'sup-slug-2'],
  })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : item)))]
      : value,
  )
  @IsArray({ message: 'MATERIAL_SUPPLIER_SLUGS_INVALID' })
  @ArrayMaxSize(MATERIAL_SUPPLIER_MAX, { message: 'MATERIAL_SUPPLIER_SLUGS_INVALID' })
  @IsString({ each: true, message: 'MATERIAL_SUPPLIER_SLUGS_INVALID' })
  @IsNotEmpty({ each: true, message: 'MATERIAL_SUPPLIER_SLUGS_INVALID' })
  supplierSlugs: string[];
}

/**
 * Query của `GET /materials/:slug/conversion-units`. Khai riêng ở module material (thay vì dùng lại
 * `GetAllUnitRequestDto` của module unit) để 2 endpoint tiến hoá độc lập — filter ở đây luôn được
 * hiểu trong phạm vi "đơn vị dùng được làm đơn vị quy đổi cho vật tư này".
 */
export class GetConversionUnitRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by exact unit business code', example: 'KG' })
  @IsOptional()
  @Transform(upper)
  code?: string;

  @ApiPropertyOptional({ description: 'Filter by unit name (substring match)' })
  @IsOptional()
  @Transform(trim)
  name?: string;
}

/**
 * Gắn 1 đơn vị QUY ĐỔI cho vật tư (`POST /materials/:slug/conversion-units`).
 *
 * Không đi qua automapper: entity đích (`MaterialUnit`) chỉ có 2 cột dữ liệu và 2 cột khoá — map
 * tự động vào entity có PK tổ hợp dễ ghi đè nhầm `materialId`/`unitId`, service gán tay rõ hơn.
 */
export class CreateMaterialConversionUnitRequestDto {
  @ApiProperty({
    description: 'Slug of the Unit to use as the conversion unit',
    example: 'unit-abc123',
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_UNIT_SLUG_IS_REQUIRED' })
  unitSlug: string;

  @ApiProperty({
    description: 'Number of BASE UNITS in 1 of this unit (1 BAG = 50 KG ⇒ 50)',
    example: 50,
    minimum: 0,
    exclusiveMinimum: true,
  })
  @Type(() => Number)
  // Cột DB là DECIMAL(18,6) — chặn ngay ở DTO thay vì để MySQL làm tròn im lặng. Xem
  // `IsDecimalWithScale`: `@IsNumber({ maxDecimalPlaces })` có sẵn thì crash với số dạng mũ.
  @IsDecimalWithScale(6, { message: 'MATERIAL_CONVERSION_RATE_INVALID' })
  @IsPositive({ message: 'MATERIAL_CONVERSION_RATE_INVALID' })
  conversionRate: number;
}

/**
 * `OmitType` bỏ `unitSlug` trước khi `PartialType`: đơn vị cần sửa đã nằm ở path param
 * (`PATCH /materials/:slug/conversion-units/:unitSlug`), cho đổi qua body nghĩa là 1 request vừa
 * trỏ vào dòng này vừa ghi sang dòng khác.
 */
export class UpdateMaterialConversionUnitRequestDto extends PartialType(
  OmitType(CreateMaterialConversionUnitRequestDto, ['unitSlug'] as const),
) {}

/** 1 dòng `material_unit_can_have_tbl` đã phẳng hoá cùng thông tin đơn vị. */

/** Body của `POST /materials/:slug/convert` — quy đổi số lượng giữa 2 đơn vị của cùng 1 vật tư. */
export class ConvertMaterialQuantityRequestDto {
  @ApiProperty({ description: 'Quantity to convert', example: 5 })
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_CONVERT_QUANTITY_INVALID' })
  @Min(0, { message: 'MATERIAL_CONVERT_QUANTITY_INVALID' })
  quantity: number;

  @ApiProperty({
    description: 'Slug of the SOURCE unit (the base unit or an attached conversion unit)',
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_UNIT_SLUG_IS_REQUIRED' })
  fromUnitSlug: string;

  @ApiProperty({
    description: 'Slug of the TARGET unit (the base unit or an attached conversion unit)',
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_UNIT_SLUG_IS_REQUIRED' })
  toUnitSlug: string;
}

/**
 * Kết quả quy đổi. Trả kèm `quantityInBaseUnit` và 2 tỉ lệ đã dùng để client đối chiếu được phép
 * tính, thay vì phải tin vào mỗi con số cuối.
 */
export class MaterialConversionResultResponseDto {
  @ApiProperty({ example: 'x7fk2p9qab' })
  materialSlug: string;

  @ApiProperty({ example: 'unit-bag' })
  fromUnitSlug: string;

  @ApiProperty({ example: 'BAG' })
  fromUnitCode: string;

  @ApiProperty({ description: 'Input quantity', example: 5 })
  fromQuantity: number;

  @ApiProperty({ description: 'Number of base units in 1 source unit', example: 50 })
  fromConversionRate: number;

  @ApiProperty({ example: 'unit-kg' })
  toUnitSlug: string;

  @ApiProperty({ example: 'KG' })
  toUnitCode: string;

  @ApiProperty({ description: 'Converted quantity (rounded to 6 decimal places)', example: 250 })
  toQuantity: number;

  @ApiProperty({ description: 'Number of base units in 1 target unit', example: 1 })
  toConversionRate: number;

  @ApiProperty({ example: 'unit-kg' })
  baseUnitSlug: string;

  @ApiProperty({ example: 'KG' })
  baseUnitCode: string;

  @ApiProperty({ description: 'Quantity expressed in the base unit', example: 250 })
  quantityInBaseUnit: number;
}
