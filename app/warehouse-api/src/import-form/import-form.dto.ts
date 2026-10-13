import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto, VersionedResponseDto } from 'src/app/base.dto';
import { IsDecimalWithScale } from 'src/shared/utils/decimal.validator';
import { QUANTITY_SCALE } from 'src/shared/utils/decimal.transformer';
import { BUSINESS_CODE_REGEX } from 'src/shared/utils/code.util';
import {
  IMPORT_FORM_DATE_REGEX,
  IMPORT_FORM_FILE_MAX_LENGTH,
  IMPORT_FORM_ITEMS_MAX,
  IMPORT_FORM_MONEY_SCALE,
  IMPORT_FORM_REFERENCE_MAX_LENGTH,
  ImportFormStatus,
} from './import-form.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * 1 dòng vật tư trong body. Chỉ nhận slug + số lượng + đơn giá: tỉ lệ quy đổi, mã/tên vật tư/đơn vị,
 * `baseQuantity` và `amount` đều do server tính/chép — không tin client.
 */
export class CreateImportFormItemDto {
  @ApiProperty({ description: 'Slug of the material', example: 'x7fk2p9qab' })
  @Transform(trim)
  @IsNotEmpty({ message: 'IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED' })
  materialSlug: string;

  @ApiProperty({
    description: 'Slug of the unit; must be attached to the material (base or conversion unit)',
    example: 'k2p9qabx7f',
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED' })
  unitSlug: string;

  @ApiProperty({ description: 'Quantity in the given unit (> 0)', example: 10.5 })
  @IsPositive({ message: 'IMPORT_FORM_ITEM_QUANTITY_INVALID' })
  @IsDecimalWithScale(QUANTITY_SCALE, { message: 'IMPORT_FORM_ITEM_QUANTITY_INVALID' })
  quantity: number;

  @ApiProperty({ description: 'Price of 1 unit (in the given unit)', example: 150000, minimum: 0 })
  @Min(0, { message: 'IMPORT_FORM_ITEM_UNIT_PRICE_INVALID' })
  @IsDecimalWithScale(IMPORT_FORM_MONEY_SCALE, { message: 'IMPORT_FORM_ITEM_UNIT_PRICE_INVALID' })
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Free-text note for this line' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_ITEM_NOTE_INVALID' })
  note?: string;
}

/**
 * Kho lấy từ route (`/warehouses/:warehouseSlug/import-forms`), người lập lấy từ JWT, người duyệt
 * gán lúc xác nhận/huỷ, trạng thái luôn bắt đầu `DRAFT` — nên không field nào trong 4 thứ đó nằm
 * trong body. Phiếu nhập không gắn nhà cung cấp.
 * `total` cũng không nằm trong body: server tính = Σ `amount` của `items`.
 */
export class CreateImportFormRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The business code of the import form', example: 'PN-2026-0001' })
  @Transform(trim)
  @Matches(BUSINESS_CODE_REGEX, { message: 'IMPORT_FORM_CODE_INVALID' })
  @IsNotEmpty({ message: 'IMPORT_FORM_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Purchase order number', example: 'PO-2026-0012' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_PURCHASE_ORDER_INVALID' })
  @MaxLength(IMPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'IMPORT_FORM_PURCHASE_ORDER_INVALID' })
  purchaseOrder?: string;

  @AutoMap()
  @ApiProperty({ description: 'Invoice code', example: 'HD-0001234' })
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_INVOICE_CODE_INVALID' })
  @MaxLength(IMPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'IMPORT_FORM_INVOICE_CODE_INVALID' })
  @IsNotEmpty({ message: 'IMPORT_FORM_INVOICE_CODE_IS_REQUIRED' })
  invoiceCode: string;

  @AutoMap()
  @ApiProperty({ description: 'Import date (YYYY-MM-DD)', example: '2026-10-12' })
  @Transform(trim)
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'IMPORT_FORM_DATE_INVALID' })
  @Matches(IMPORT_FORM_DATE_REGEX, { message: 'IMPORT_FORM_DATE_INVALID' })
  date: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Attached file key/URL', example: 'import-forms/pn-1.pdf' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_FILE_INVALID' })
  @MaxLength(IMPORT_FORM_FILE_MAX_LENGTH, { message: 'IMPORT_FORM_FILE_INVALID' })
  file?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Free-text note' })
  @IsOptional()
  @Transform(trim)
  note?: string;

  // Cố ý KHÔNG `@AutoMap()`: service resolve vật tư/đơn vị rồi tự dựng `ImportFormItem`.
  @ApiProperty({ type: [CreateImportFormItemDto], description: 'Material lines (at least 1)' })
  @IsArray({ message: 'IMPORT_FORM_ITEMS_IS_REQUIRED' })
  @ArrayNotEmpty({ message: 'IMPORT_FORM_ITEMS_IS_REQUIRED' })
  @ArrayMaxSize(IMPORT_FORM_ITEMS_MAX, { message: 'IMPORT_FORM_ITEMS_TOO_MANY' })
  @ValidateNested({ each: true })
  @Type(() => CreateImportFormItemDto)
  items: CreateImportFormItemDto[];
}

/**
 * PATCH partial (chỉ khi phiếu còn `DRAFT`). Gửi `items` là THAY TOÀN BỘ dòng của phiếu (vẫn phải
 * có ít nhất 1 dòng) và tính lại `total`; không gửi thì giữ nguyên dòng cũ. `version` bắt buộc — optimistic lock của
 * `VersionedBase`, xem `UpdateExampleRequestDto`.
 */
export class UpdateImportFormRequestDto extends PartialType(CreateImportFormRequestDto) {
  @ApiProperty({
    description: 'Version received from the most recent GET, used to detect conflicts',
    minimum: 1,
  })
  @IsNotEmpty()
  @IsInt()
  // `@Min(1)`: `version: 0` là falsy ⇒ TypeORM bỏ qua check optimistic lock (xem CLAUDE.md).
  @Min(1)
  version: number;
}

/** Body của `POST .../confirm` và `POST .../cancel` — chỉ mang `version` cho optimistic lock. */
export class ChangeImportFormStatusRequestDto {
  @ApiProperty({
    description: 'Version received from the most recent GET, used to detect conflicts',
    minimum: 1,
  })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  version: number;
}

export class GetAllImportFormRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: ImportFormStatus })
  @IsOptional()
  @IsEnum(ImportFormStatus, { message: 'IMPORT_FORM_STATUS_INVALID' })
  status?: ImportFormStatus;
}

export class GetImportFormAvailableMaterialRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Exact material code' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Part of the material name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  name?: string;
}

export class ImportFormAvailableUnitResponseDto {
  @ApiProperty()
  unitSlug: string;

  @ApiProperty()
  unitCode: string;

  @ApiProperty()
  unitName: string;

  @ApiProperty({ description: 'Base units in 1 of this unit (1 for the base unit)' })
  conversionRate: number;

  @ApiProperty()
  isBaseUnit: boolean;
}

/**
 * Vật tư đã gán vào kho (có dòng `inventory_tbl`) — chỉ những vật tư này mới ghi được vào phiếu
 * nhập của kho. `units` là các đơn vị đã gắn cho vật tư (chọn làm `unitSlug` của dòng phiếu).
 */
export class ImportFormAvailableMaterialResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ description: 'Slug of the base unit (null for legacy materials)' })
  baseUnitSlug?: string | null;

  @ApiProperty({ description: 'Current stock in this warehouse, in the base unit' })
  quantity: number;

  @ApiPropertyOptional()
  supplierSlug?: string | null;

  @ApiPropertyOptional()
  supplierName?: string | null;

  @ApiProperty({ type: [ImportFormAvailableUnitResponseDto] })
  units: ImportFormAvailableUnitResponseDto[];
}

export class ImportFormItemResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ description: 'Line number, in the order the items were sent (1-based)' })
  lineNo: number;

  @ApiProperty()
  materialSlug: string;

  @AutoMap()
  @ApiProperty()
  materialCode: string;

  @AutoMap()
  @ApiProperty()
  materialName: string;

  @ApiProperty()
  unitSlug: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Supplier of the material, snapshotted when the line was written (null if none)',
  })
  supplierSlug?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  supplierCode?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  supplierName?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  supplierTaxCode?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  supplierAddress?: string | null;

  @AutoMap()
  @ApiProperty()
  unitCode: string;

  @AutoMap()
  @ApiProperty()
  unitName: string;

  @AutoMap()
  @ApiProperty({ description: 'Quantity in the given unit' })
  quantity: number;

  @AutoMap()
  @ApiProperty({ description: 'Base units in 1 given unit, snapshotted when the line was written' })
  conversionRate: number;

  @AutoMap()
  @ApiProperty({ description: 'quantity × conversionRate, in the material base unit' })
  baseQuantity: number;

  @AutoMap()
  @ApiProperty()
  unitPrice: number;

  @AutoMap()
  @ApiProperty({ description: 'quantity × unitPrice' })
  amount: number;

  @AutoMap()
  @ApiPropertyOptional()
  note?: string | null;
}

export class ImportFormResponseDto extends VersionedResponseDto {
  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiPropertyOptional()
  purchaseOrder?: string;

  @AutoMap()
  @ApiProperty()
  invoiceCode: string;

  @ApiPropertyOptional({ description: 'Slug of the requester (null if the user was removed)' })
  requesterSlug?: string | null;

  @AutoMap()
  @ApiProperty()
  requesterName: string;

  @ApiPropertyOptional({ description: 'Slug of the user who confirmed/cancelled the form' })
  approverSlug?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  approverName?: string | null;

  @AutoMap()
  @ApiProperty({ example: '2026-10-12' })
  date: string;

  @AutoMap()
  @ApiProperty({ description: 'Sum of items.amount, computed by the server' })
  total: number;

  @AutoMap()
  @ApiPropertyOptional()
  file?: string;

  @AutoMap()
  @ApiPropertyOptional()
  note?: string;

  @AutoMap()
  @ApiProperty({ enum: ImportFormStatus })
  status: ImportFormStatus;

  @ApiProperty()
  warehouseSlug: string;

  @ApiPropertyOptional({
    type: () => [ImportFormItemResponseDto],
    description: 'Material lines. Omitted in the list endpoint.',
  })
  items?: ImportFormItemResponseDto[];
}
