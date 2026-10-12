import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, VersionedResponseDto } from 'src/app/base.dto';
import { IsDecimalWithScale } from 'src/shared/utils/decimal.validator';
import { BUSINESS_CODE_REGEX } from 'src/shared/utils/code.util';
import {
  IMPORT_FORM_DATE_REGEX,
  IMPORT_FORM_FILE_MAX_LENGTH,
  IMPORT_FORM_MONEY_SCALE,
  IMPORT_FORM_REFERENCE_MAX_LENGTH,
  ImportFormStatus,
} from './import-form.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Kho lấy từ route (`/warehouses/:warehouseSlug/import-forms`), người lập lấy từ JWT, người duyệt
 * gán lúc xác nhận/huỷ, trạng thái luôn bắt đầu `DRAFT` — nên không field nào trong 4 thứ đó nằm
 * trong body. Thông tin nhà cung cấp chỉ nhận `supplierSlug`, phần snapshot do server chép từ DB.
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
  @ApiProperty({ description: 'Supplier invoice code', example: 'HD-0001234' })
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_INVOICE_CODE_INVALID' })
  @MaxLength(IMPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'IMPORT_FORM_INVOICE_CODE_INVALID' })
  @IsNotEmpty({ message: 'IMPORT_FORM_INVOICE_CODE_IS_REQUIRED' })
  invoiceCode: string;

  // Cố ý KHÔNG `@AutoMap()`: entity có cột snapshot cùng tên, service tự chép từ nhà cung cấp đã
  // resolve thay vì tin giá trị client gửi.
  @ApiProperty({ description: 'Slug of the supplier', example: 'x7fk2p9qab' })
  @Transform(trim)
  @IsNotEmpty({ message: 'IMPORT_FORM_SUPPLIER_SLUG_IS_REQUIRED' })
  supplierSlug: string;

  @AutoMap()
  @ApiProperty({ description: 'Import date (YYYY-MM-DD)', example: '2026-10-12' })
  @Transform(trim)
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'IMPORT_FORM_DATE_INVALID' })
  @Matches(IMPORT_FORM_DATE_REGEX, { message: 'IMPORT_FORM_DATE_INVALID' })
  date: string;

  @AutoMap()
  @ApiProperty({ description: 'Total amount of the form', example: 1500000.5, minimum: 0 })
  @Min(0, { message: 'IMPORT_FORM_TOTAL_INVALID' })
  @IsDecimalWithScale(IMPORT_FORM_MONEY_SCALE, { message: 'IMPORT_FORM_TOTAL_INVALID' })
  total: number;

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
}

/**
 * PATCH partial (chỉ khi phiếu còn `DRAFT`). `version` bắt buộc — optimistic lock của
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

  @ApiPropertyOptional({ description: 'Only forms of this supplier' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  supplierSlug?: string;
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

  @AutoMap()
  @ApiProperty()
  supplierSlug: string;

  @AutoMap()
  @ApiProperty()
  supplierName: string;

  @AutoMap()
  @ApiProperty()
  supplierCode: string;

  @AutoMap()
  @ApiPropertyOptional()
  supplierTaxCode?: string | null;

  @AutoMap()
  @ApiPropertyOptional()
  supplierAddress?: string | null;

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
  @ApiProperty()
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
}
