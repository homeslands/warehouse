import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
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
  SUPPLIER_PHONENUMBER_REGEX,
  SUPPLIER_TAX_CODE_REGEX,
  SupplierTransactionType,
} from './supplier.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateSupplierRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The business code of the supplier', example: 'NCC-HN-01' })
  @Transform(trim)
  @Matches(SUPPLIER_CODE_REGEX, { message: 'SUPPLIER_CODE_INVALID' })
  @IsNotEmpty({ message: 'SUPPLIER_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiProperty({ description: 'The name of the supplier', example: 'Công ty TNHH Vật tư ABC' })
  @Transform(trim)
  @IsNotEmpty({ message: 'SUPPLIER_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The tax code (MST) of the supplier', example: '0101234567' })
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
  @ApiPropertyOptional({ description: 'The contact email', example: 'lienhe@abc.vn' })
  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'SUPPLIER_EMAIL_INVALID' })
  email?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The address of the supplier', example: 'Số 1, Cầu Giấy' })
  @IsOptional()
  @Transform(trim)
  address?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The contact person', example: 'Nguyễn Văn A' })
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
  @ApiPropertyOptional({ description: 'Filter by exact business code', example: 'NCC-HN-01' })
  @IsOptional()
  @Transform(upper)
  code?: string;

  @ApiPropertyOptional({ description: 'Filter by exact tax code (MST)', example: '0101234567' })
  @IsOptional()
  @Transform(trim)
  taxCode?: string;

  @ApiPropertyOptional({
    description: 'Search keyword (chứa chuỗi con) — khớp 1 trong name / contactPerson / email (OR)',
    example: 'abc',
  })
  @IsOptional()
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by phone number (chứa chuỗi con)', example: '0241' })
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

  @ApiPropertyOptional({ description: 'Filter by material name (chứa chuỗi con)' })
  @IsOptional()
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional({
    description: 'Từ thời điểm (ISO 8601, tính theo createdAt của vật tư, bao gồm)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_MATERIAL_DATE_INVALID' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Đến thời điểm (ISO 8601, tính theo createdAt của vật tư, bao gồm)',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_MATERIAL_DATE_INVALID' })
  to?: string;
}

/** Vật tư gắn với nhà cung cấp — bản rút gọn, flatten quan hệ ra `slug`/`name` (không lộ `id`). */
export class SupplierMaterialResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ description: 'Slug của loại vật tư' })
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Tên loại vật tư' })
  typeName?: string;

  @ApiPropertyOptional({ description: 'Slug của đơn vị cơ sở' })
  baseUnitSlug?: string;

  @ApiPropertyOptional({ description: 'Tên đơn vị cơ sở' })
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
    description: 'Slug vật tư — bắt buộc với PURCHASE/RETURN, phải đang gắn với nhà cung cấp này',
    example: 'm8kq2p9xab',
  })
  @ValidateIf(isMaterialTransaction)
  @IsNotEmpty({ message: 'SUPPLIER_TRANSACTION_MATERIAL_IS_REQUIRED' })
  materialSlug?: string;

  @ApiPropertyOptional({
    description: 'Số lượng theo đơn vị cơ sở của vật tư — bắt buộc với PURCHASE/RETURN',
    example: 10.5,
  })
  @ValidateIf(isMaterialTransaction)
  @Type(() => Number)
  @IsDecimalWithScale(QUANTITY_SCALE, { message: 'SUPPLIER_TRANSACTION_QUANTITY_INVALID' })
  @Min(0.000001, { message: 'SUPPLIER_TRANSACTION_QUANTITY_INVALID' })
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Đơn giá trên 1 đơn vị cơ sở — bắt buộc với PURCHASE/RETURN',
    example: 125000,
  })
  @ValidateIf(isMaterialTransaction)
  @Type(() => Number)
  @IsDecimalWithScale(MONEY_SCALE, { message: 'SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID' })
  @Min(0, { message: 'SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID' })
  unitPrice?: number;

  @ApiPropertyOptional({
    description: 'Số tiền — bắt buộc với PAYMENT; với PURCHASE/RETURN bị bỏ qua (server tự tính)',
    example: 5000000,
  })
  @ValidateIf((o: CreateSupplierTransactionRequestDto) => !isMaterialTransaction(o))
  @Type(() => Number)
  @IsDecimalWithScale(MONEY_SCALE, { message: 'SUPPLIER_TRANSACTION_AMOUNT_INVALID' })
  @Min(0.01, { message: 'SUPPLIER_TRANSACTION_AMOUNT_INVALID' })
  amount?: number;

  @ApiPropertyOptional({
    description: 'Thời điểm giao dịch (ISO 8601), mặc định là thời điểm ghi',
    example: '2026-09-29T08:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_TRANSACTION_DATE_INVALID' })
  transactionDate?: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsOptional()
  note?: string;
}

export class GetSupplierTransactionRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: SupplierTransactionType, description: 'Lọc theo loại giao dịch' })
  @IsOptional()
  @IsEnum(SupplierTransactionType, { message: 'SUPPLIER_TRANSACTION_TYPE_INVALID' })
  type?: SupplierTransactionType;

  @ApiPropertyOptional({ description: 'Lọc theo vật tư (slug)' })
  @IsOptional()
  @IsNotEmpty()
  materialSlug?: string;

  @ApiPropertyOptional({
    description: 'Từ thời điểm (ISO 8601, tính theo transactionDate, bao gồm)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'SUPPLIER_TRANSACTION_DATE_INVALID' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Đến thời điểm (ISO 8601, tính theo transactionDate, bao gồm)',
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
  @ApiPropertyOptional({ description: 'Số lượng theo đơn vị cơ sở' })
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

  @ApiPropertyOptional({ description: 'Slug của người ghi giao dịch' })
  performedBySlug?: string;

  @ApiPropertyOptional({ description: 'Họ tên người ghi giao dịch' })
  performedByName?: string;
}
