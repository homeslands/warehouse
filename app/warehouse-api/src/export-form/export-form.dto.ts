import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
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
import { SEARCH_CODE_REGEX } from 'src/shared/utils/query.util';
import {
  EXPORT_FORM_FILE_MAX_LENGTH,
  EXPORT_FORM_ITEMS_MAX,
  EXPORT_FORM_MONEY_SCALE,
  EXPORT_FORM_RECEIVER_MAX_LENGTH,
  EXPORT_FORM_REFERENCE_MAX_LENGTH,
  ExportFormStatus,
  ExportFormType,
} from './export-form.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/**
 * 1 dòng vật tư trong body. Tỉ lệ quy đổi, mã/tên, `baseQuantity`, `amount` do server tính/chép.
 * `batchSlug` không gửi ⇒ xác nhận phiếu tự chọn lô theo FEFO (hạn dùng sớm nhất trước).
 */
export class CreateExportFormItemDto {
  @ApiProperty({ description: 'Slug of the material', example: 'x7fk2p9qab' })
  @Transform(trim)
  @IsNotEmpty({ message: 'EXPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED' })
  materialSlug: string;

  @ApiProperty({
    description: 'Slug of the unit; must be attached to the material (base or conversion unit)',
    example: 'k2p9qabx7f',
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'EXPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED' })
  unitSlug: string;

  @ApiProperty({ description: 'Quantity in the given unit (> 0)', example: 10.5 })
  @IsPositive({ message: 'EXPORT_FORM_ITEM_QUANTITY_INVALID' })
  @IsDecimalWithScale(QUANTITY_SCALE, { message: 'EXPORT_FORM_ITEM_QUANTITY_INVALID' })
  quantity: number;

  @ApiProperty({ description: 'Price of 1 unit (in the given unit)', example: 150000, minimum: 0 })
  @Min(0, { message: 'EXPORT_FORM_ITEM_UNIT_PRICE_INVALID' })
  @IsDecimalWithScale(EXPORT_FORM_MONEY_SCALE, { message: 'EXPORT_FORM_ITEM_UNIT_PRICE_INVALID' })
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Free-text note for this line' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'EXPORT_FORM_ITEM_NOTE_INVALID' })
  note?: string;

  @ApiPropertyOptional({
    description:
      'Slug of the material batch to take from (must be in this warehouse, of this material, in ' +
      'stock). Omitted: on confirm, the batches with the earliest expiry date are used (FEFO) and ' +
      'the line is split per batch if needed',
    example: 'b7fk2p9qab',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'EXPORT_FORM_ITEM_BATCH_SLUG_INVALID' })
  @IsNotEmpty({ message: 'EXPORT_FORM_ITEM_BATCH_SLUG_INVALID' })
  batchSlug?: string;
}

/**
 * Kho lấy từ route, người lập từ JWT, người duyệt gán lúc xác nhận/huỷ, trạng thái luôn bắt đầu
 * `DRAFT`, `totalAmount` = Σ `amount` của `items` do server tính — không field nào trong số đó nằm
 * trong body.
 */
export class CreateExportFormRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The business code of the export form', example: 'PX-2026-0001' })
  @Transform(trim)
  @Matches(BUSINESS_CODE_REGEX, { message: 'EXPORT_FORM_CODE_INVALID' })
  @IsNotEmpty({ message: 'EXPORT_FORM_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiProperty({ enum: ExportFormType, description: 'Reason of the export' })
  @IsEnum(ExportFormType, { message: 'EXPORT_FORM_TYPE_INVALID' })
  type: ExportFormType;

  @AutoMap()
  @ApiProperty({ description: 'Purchase order number', example: 'PO-2026-0012' })
  @Transform(trim)
  @IsString({ message: 'EXPORT_FORM_PURCHASE_ORDER_INVALID' })
  @MaxLength(EXPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'EXPORT_FORM_PURCHASE_ORDER_INVALID' })
  @IsNotEmpty({ message: 'EXPORT_FORM_PURCHASE_ORDER_IS_REQUIRED' })
  purchaseOrder: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Invoice code', example: 'HD-0001234' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'EXPORT_FORM_INVOICE_CODE_INVALID' })
  @MaxLength(EXPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'EXPORT_FORM_INVOICE_CODE_INVALID' })
  invoiceCode?: string;

  @AutoMap()
  @ApiProperty({ description: 'Person / department receiving the goods', example: 'Xưởng A' })
  @Transform(trim)
  @IsString({ message: 'EXPORT_FORM_RECEIVER_INVALID' })
  @MaxLength(EXPORT_FORM_RECEIVER_MAX_LENGTH, { message: 'EXPORT_FORM_RECEIVER_INVALID' })
  @IsNotEmpty({ message: 'EXPORT_FORM_RECEIVER_IS_REQUIRED' })
  receiver: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'S3 link returned by `POST .../export-forms/upload-file` — stored as-is',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'EXPORT_FORM_FILE_INVALID' })
  @MaxLength(EXPORT_FORM_FILE_MAX_LENGTH, { message: 'EXPORT_FORM_FILE_INVALID' })
  file?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Free-text note' })
  @IsOptional()
  @Transform(trim)
  note?: string;

  // Cố ý KHÔNG `@AutoMap()`: service resolve vật tư/đơn vị/lô rồi tự dựng `ExportFormItem`.
  @ApiProperty({ type: [CreateExportFormItemDto], description: 'Material lines (at least 1)' })
  @IsArray({ message: 'EXPORT_FORM_ITEMS_IS_REQUIRED' })
  @ArrayNotEmpty({ message: 'EXPORT_FORM_ITEMS_IS_REQUIRED' })
  @ArrayMaxSize(EXPORT_FORM_ITEMS_MAX, { message: 'EXPORT_FORM_ITEMS_TOO_MANY' })
  @ValidateNested({ each: true })
  @Type(() => CreateExportFormItemDto)
  items: CreateExportFormItemDto[];
}

/**
 * PATCH partial (chỉ khi phiếu còn `DRAFT`). Gửi `items` = THAY TOÀN BỘ dòng và tính lại
 * `totalAmount`. `version` bắt buộc — optimistic lock của `VersionedBase`.
 */
export class UpdateExportFormRequestDto extends PartialType(CreateExportFormRequestDto) {
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
export class ChangeExportFormStatusRequestDto {
  @ApiProperty({
    description: 'Version received from the most recent GET, used to detect conflicts',
    minimum: 1,
  })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  version: number;
}

/** Field sắp xếp của `GET .../export-forms` — map sang cột ở `buildSortOrder()` trong service. */
export enum ExportFormSortBy {
  CreatedAt = 'createdAt',
  Code = 'code',
}

export class GetAllExportFormRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: ExportFormStatus })
  @IsOptional()
  @IsEnum(ExportFormStatus, { message: 'EXPORT_FORM_STATUS_INVALID' })
  status?: ExportFormStatus;

  @ApiPropertyOptional({ enum: ExportFormType })
  @IsOptional()
  @IsEnum(ExportFormType, { message: 'EXPORT_FORM_TYPE_INVALID' })
  type?: ExportFormType;

  @ApiPropertyOptional({
    description: 'Filter by form code (prefix match, case-insensitive)',
    example: 'PX-2026',
  })
  @IsOptional()
  @Transform(upper)
  @Matches(SEARCH_CODE_REGEX, { message: 'EXPORT_FORM_CODE_SEARCH_INVALID' })
  code?: string;

  @ApiPropertyOptional({ description: 'Filter by invoice code (prefix match)' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'EXPORT_FORM_INVOICE_CODE_INVALID' })
  @MaxLength(EXPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'EXPORT_FORM_INVOICE_CODE_INVALID' })
  invoiceCode?: string;

  @ApiPropertyOptional({ description: 'Filter by purchase order number (prefix match)' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'EXPORT_FORM_PURCHASE_ORDER_INVALID' })
  @MaxLength(EXPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'EXPORT_FORM_PURCHASE_ORDER_INVALID' })
  purchaseOrder?: string;

  @ApiPropertyOptional({ description: 'Filter by the slug of the requester (exact match)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  requesterSlug?: string;

  @ApiPropertyOptional({
    description: 'Filter by the slug of the approver — the user who confirmed/cancelled the form',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  approverSlug?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ExportFormSortBy,
    default: ExportFormSortBy.CreatedAt,
  })
  @IsOptional()
  @IsEnum(ExportFormSortBy, { message: 'SORT_BY_INVALID' })
  sortBy?: ExportFormSortBy = ExportFormSortBy.CreatedAt;
}

export class ExportFormItemResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ description: 'Line number (1-based). Confirm may split a line per batch' })
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
  @ApiProperty()
  unitCode: string;

  @AutoMap()
  @ApiProperty()
  unitName: string;

  @ApiPropertyOptional({
    description: 'Slug of the batch taken from. null on a draft line without a chosen batch',
  })
  batchSlug?: string | null;

  @ApiPropertyOptional({ description: 'Expiry date of the batch (null if none / no batch)' })
  batchExpiryDate?: string | null;

  @AutoMap()
  @ApiProperty({ description: 'Quantity in the given unit' })
  quantity: number;

  @AutoMap()
  @ApiProperty({ description: 'Base units in 1 given unit, snapshotted when the line was written' })
  conversionRate: number;

  @AutoMap()
  @ApiProperty({ description: 'Quantity in the material base unit (taken out of stock)' })
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

export class ExportFormResponseDto extends VersionedResponseDto {
  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiProperty({ enum: ExportFormType })
  type: ExportFormType;

  @AutoMap()
  @ApiProperty({ enum: ExportFormStatus })
  status: ExportFormStatus;

  @AutoMap()
  @ApiProperty()
  purchaseOrder: string;

  @AutoMap()
  @ApiPropertyOptional()
  invoiceCode?: string | null;

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
  @ApiProperty()
  receiver: string;

  @AutoMap()
  @ApiProperty({ description: 'Sum of items.amount, computed by the server' })
  totalAmount: number;

  @AutoMap()
  @ApiPropertyOptional()
  note?: string;

  @AutoMap()
  @ApiPropertyOptional()
  file?: string;

  @ApiProperty()
  warehouseSlug: string;

  @ApiPropertyOptional({
    type: () => [ExportFormItemResponseDto],
    description: 'Material lines. Omitted in the list endpoint.',
  })
  items?: ExportFormItemResponseDto[];
}
