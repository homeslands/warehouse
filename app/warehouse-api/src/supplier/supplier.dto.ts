import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { IsDecimalWithScale } from 'src/shared/utils/decimal.validator';
import { QUANTITY_SCALE } from 'src/shared/utils/decimal.transformer';
import {
  MATERIAL_TRANSACTION_TYPES,
  MONEY_SCALE,
  SUPPLIER_CODE_REGEX,
  SUPPLIER_MATERIAL_BATCH_MAX,
  SUPPLIER_PHONENUMBER_REGEX,
  SUPPLIER_TAX_CODE_REGEX,
  SupplierTransactionType,
} from './supplier.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateSupplierRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The business code of the supplier', example: 'SUP-HN-01' })
  @Transform(trim)
  @Matches(SUPPLIER_CODE_REGEX, { message: 'SUPPLIER_CODE_INVALID' })
  @IsNotEmpty({ message: 'SUPPLIER_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiProperty({ description: 'The name of the supplier', example: 'ABC Materials Co., Ltd.' })
  @Transform(trim)
  @IsNotEmpty({ message: 'SUPPLIER_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The tax code of the supplier', example: '0101234567' })
  @IsOptional()
  @Transform(trim)
  @Matches(SUPPLIER_TAX_CODE_REGEX, { message: 'SUPPLIER_TAX_CODE_INVALID' })
  taxCode?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The contact phone number', example: '02412345678' })
  @IsOptional()
  @Transform(trim)
  @Matches(SUPPLIER_PHONENUMBER_REGEX, { message: 'SUPPLIER_PHONENUMBER_INVALID' })
  phonenumber?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The contact email', example: 'contact@abc.vn' })
  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'SUPPLIER_EMAIL_INVALID' })
  email?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The address of the supplier', example: 'No. 1, Cau Giay' })
  @IsOptional()
  @Transform(trim)
  address?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The contact person', example: 'Nguyen Van A' })
  @IsOptional()
  @Transform(trim)
  contactPerson?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Free-form note' })
  @IsOptional()
  note?: string;
}

/**
 * PATCH đúng nghĩa REST: mọi field đều optional, field nào không gửi thì giữ nguyên giá trị cũ
 * (`PartialType` gắn `@IsOptional()` lên toàn bộ field thừa hưởng, validator vẫn chạy khi field CÓ
 * mặt). DTO cha không có property initializer nên không cần huỷ field nào ở đây.
 */
export class UpdateSupplierRequestDto extends PartialType(CreateSupplierRequestDto) {}

export class GetAllSupplierRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by exact business code', example: 'SUP-HN-01' })
  @IsOptional()
  @Transform(upper)
  code?: string;

  @ApiPropertyOptional({ description: 'Filter by exact tax code', example: '0101234567' })
  @IsOptional()
  @Transform(trim)
  taxCode?: string;

  @ApiPropertyOptional({
    description: 'Search keyword (substring) — matches any of name / contactPerson / email (OR)',
    example: 'abc',
  })
  @IsOptional()
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by phone number (substring)', example: '0241' })
  @IsOptional()
  @Transform(trim)
  phonenumber?: string;
}

export class SupplierResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiPropertyOptional()
  taxCode?: string;

  @AutoMap()
  @ApiPropertyOptional()
  phonenumber?: string;

  @AutoMap()
  @ApiPropertyOptional()
  email?: string;

  @AutoMap()
  @ApiPropertyOptional()
  address?: string;

  @AutoMap()
  @ApiPropertyOptional()
  contactPerson?: string;

  @AutoMap()
  @ApiPropertyOptional()
  note?: string;
}

export class GetSupplierMaterialRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by the slug of the material type' })
  @IsOptional()
  @Transform(trim)
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Filter by exact material code', example: 'MAT-001' })
  @IsOptional()
  @Transform(upper)
  code?: string;

  @ApiPropertyOptional({ description: 'Filter by material name (substring)' })
  @IsOptional()
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional({
    description: 'From time (ISO 8601, based on the material createdAt, inclusive)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_MATERIAL_DATE_INVALID' })
  from?: string;

  @ApiPropertyOptional({
    description: 'To time (ISO 8601, based on the material createdAt, inclusive)',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_MATERIAL_DATE_INVALID' })
  to?: string;
}

/**
 * Body của `PUT|DELETE /suppliers/:slug/materials` (gắn/gỡ hàng loạt). Slug được trim và khử trùng
 * lặp trước khi validate, nên gửi trùng 1 slug không làm lô bị coi là thiếu vật tư.
 */
export class SupplierMaterialSlugsRequestDto {
  @ApiProperty({
    type: [String],
    description: `Material slugs (1-${SUPPLIER_MATERIAL_BATCH_MAX})`,
    example: ['m8kq2p9xab', 'k3ft7w1zcd'],
  })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : item)))]
      : value,
  )
  @IsArray({ message: 'SUPPLIER_MATERIAL_SLUGS_INVALID' })
  @ArrayNotEmpty({ message: 'SUPPLIER_MATERIAL_SLUGS_INVALID' })
  @ArrayMaxSize(SUPPLIER_MATERIAL_BATCH_MAX, { message: 'SUPPLIER_MATERIAL_SLUGS_INVALID' })
  @IsString({ each: true, message: 'SUPPLIER_MATERIAL_SLUGS_INVALID' })
  @IsNotEmpty({ each: true, message: 'SUPPLIER_MATERIAL_SLUGS_INVALID' })
  materialSlugs: string[];
}

/** Vật tư gắn với nhà cung cấp — bản rút gọn, flatten quan hệ ra `slug`/`name` (không lộ `id`). */
export class SupplierMaterialResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ description: 'Slug of the material type' })
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Name of the material type' })
  typeName?: string;

  @ApiPropertyOptional({ description: 'Slug of the base unit' })
  baseUnitSlug?: string;

  @ApiPropertyOptional({ description: 'Name of the base unit' })
  baseUnitName?: string;
}

const isMaterialTransaction = (o: CreateSupplierTransactionRequestDto) =>
  MATERIAL_TRANSACTION_TYPES.includes(o.type);

/**
 * Bộ field bắt buộc phụ thuộc `type`:
 * - `PURCHASE`/`RETURN`: `materialSlug` + `quantity` + `unitPrice`; `amount` bị bỏ qua, server tự
 *   tính = quantity × unitPrice.
 * - `PAYMENT`: chỉ `amount`; gửi kèm vật tư/số lượng/đơn giá là lỗi (chặn ở service để trả mã rõ
 *   ràng thay vì âm thầm bỏ đi).
 */
export class CreateSupplierTransactionRequestDto {
  @ApiProperty({ enum: SupplierTransactionType, example: SupplierTransactionType.Purchase })
  @IsEnum(SupplierTransactionType, { message: 'SUPPLIER_TRANSACTION_TYPE_INVALID' })
  type: SupplierTransactionType;

  @ApiPropertyOptional({
    description: 'Material slug — required for PURCHASE/RETURN, must be attached to this supplier',
    example: 'm8kq2p9xab',
  })
  @ValidateIf(isMaterialTransaction)
  @IsNotEmpty({ message: 'SUPPLIER_TRANSACTION_MATERIAL_IS_REQUIRED' })
  materialSlug?: string;

  @ApiPropertyOptional({
    description: 'Quantity in the base unit of the material — required for PURCHASE/RETURN',
    example: 10.5,
  })
  @ValidateIf(isMaterialTransaction)
  @Type(() => Number)
  @IsDecimalWithScale(QUANTITY_SCALE, { message: 'SUPPLIER_TRANSACTION_QUANTITY_INVALID' })
  @Min(0.000001, { message: 'SUPPLIER_TRANSACTION_QUANTITY_INVALID' })
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Unit price per base unit — required for PURCHASE/RETURN',
    example: 125000,
  })
  @ValidateIf(isMaterialTransaction)
  @Type(() => Number)
  @IsDecimalWithScale(MONEY_SCALE, { message: 'SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID' })
  @Min(0, { message: 'SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID' })
  unitPrice?: number;

  @ApiPropertyOptional({
    description: 'Amount — required for PAYMENT; ignored for PURCHASE/RETURN (server-computed)',
    example: 5000000,
  })
  @ValidateIf((o: CreateSupplierTransactionRequestDto) => !isMaterialTransaction(o))
  @Type(() => Number)
  @IsDecimalWithScale(MONEY_SCALE, { message: 'SUPPLIER_TRANSACTION_AMOUNT_INVALID' })
  @Min(0.01, { message: 'SUPPLIER_TRANSACTION_AMOUNT_INVALID' })
  amount?: number;

  @ApiPropertyOptional({
    description: 'Transaction time (ISO 8601), defaults to the time of recording',
    example: '2026-09-29T08:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_TRANSACTION_DATE_INVALID' })
  transactionDate?: string;

  @ApiPropertyOptional({ description: 'Note' })
  @IsOptional()
  note?: string;
}

export class GetSupplierTransactionRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: SupplierTransactionType, description: 'Filter by transaction type' })
  @IsOptional()
  @IsEnum(SupplierTransactionType, { message: 'SUPPLIER_TRANSACTION_TYPE_INVALID' })
  type?: SupplierTransactionType;

  @ApiPropertyOptional({ description: 'Filter by material (slug)' })
  @IsOptional()
  @IsNotEmpty()
  materialSlug?: string;

  @ApiPropertyOptional({
    description: 'From time (ISO 8601, based on transactionDate, inclusive)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_TRANSACTION_DATE_INVALID' })
  from?: string;

  @ApiPropertyOptional({
    description: 'To time (ISO 8601, based on transactionDate, inclusive)',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_TRANSACTION_DATE_INVALID' })
  to?: string;
}

/** 1 dòng giao dịch, mới nhất trước (theo `transactionDate`). */
export class SupplierTransactionResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ enum: SupplierTransactionType })
  type: SupplierTransactionType;

  @ApiPropertyOptional()
  materialSlug?: string;

  @ApiPropertyOptional()
  materialCode?: string;

  @ApiPropertyOptional()
  materialName?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Quantity in the base unit' })
  quantity?: number;

  @AutoMap()
  @ApiPropertyOptional()
  unitPrice?: number;

  @AutoMap()
  @ApiProperty()
  amount: number;

  @ApiProperty()
  transactionDate: string;

  @AutoMap()
  @ApiPropertyOptional()
  note?: string;

  @ApiPropertyOptional({ description: 'Slug of the user who recorded the transaction' })
  performedBySlug?: string;

  @ApiPropertyOptional({ description: 'Full name of the user who recorded the transaction' })
  performedByName?: string;
}
