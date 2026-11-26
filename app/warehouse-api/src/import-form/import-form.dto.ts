import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto, VersionedResponseDto } from 'src/app/base.dto';
import { IsDecimalWithScale } from 'src/shared/utils/decimal.validator';
import { SEARCH_CODE_REGEX } from 'src/shared/utils/query.util';
import { MATERIAL_BARCODE_REGEX } from 'src/material/material.dto';
import {
  IMPORT_FORM_ADD_QUANTITY_MAX,
  IMPORT_FORM_DATE_REGEX,
  IMPORT_FORM_FILE_MAX_LENGTH,
  IMPORT_FORM_MONEY_SCALE,
  IMPORT_FORM_REFERENCE_MAX_LENGTH,
  ImportFormStatus,
} from './import-form.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/**
 * Thêm hàng vào phiếu nháp (`POST .../import-forms/:slug/items`). Vật tư chỉ ra bằng ĐÚNG 1 trong 2:
 * `barcode` (quét) hoặc `materialSlug` (chọn tay). Mỗi đơn vị (`quantity` = số đơn vị, nguyên) thành
 * 1 dòng mang 1 mã riêng. Tỉ lệ quy đổi, mã/tên vật tư/đơn vị, `baseQuantity` và `amount` đều do
 * server tính/chép — không tin client.
 */
export class AddImportFormItemRequestDto {
  @ApiPropertyOptional({
    description: 'Barcode of the material (scan). Send exactly one of barcode / materialSlug',
    example: '2000100000019',
  })
  @IsOptional()
  @Transform(trim)
  @Matches(MATERIAL_BARCODE_REGEX, { message: 'IMPORT_FORM_ITEM_BARCODE_INVALID' })
  barcode?: string;

  @ApiPropertyOptional({
    description: 'Slug of the material (manual entry). Send exactly one of barcode / materialSlug',
    example: 'x7fk2p9qab',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED' })
  @IsNotEmpty({ message: 'IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED' })
  materialSlug?: string;

  @ApiPropertyOptional({
    description:
      'Slug of the unit; must be attached to the material (base or conversion unit). Omitted: ' +
      'the base unit of the material',
    example: 'k2p9qabx7f',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED' })
  @IsNotEmpty({ message: 'IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED' })
  unitSlug?: string;

  @ApiPropertyOptional({
    description:
      'Number of units to add (integer). Each unit becomes 1 line with its own code. A scan sends 1',
    default: 1,
    minimum: 1,
    maximum: IMPORT_FORM_ADD_QUANTITY_MAX,
  })
  @IsOptional()
  @IsInt({ message: 'IMPORT_FORM_ITEM_QUANTITY_INVALID' })
  @Min(1, { message: 'IMPORT_FORM_ITEM_QUANTITY_INVALID' })
  @Max(IMPORT_FORM_ADD_QUANTITY_MAX, { message: 'IMPORT_FORM_ITEM_QUANTITY_INVALID' })
  quantity?: number = 1;

  @ApiProperty({ description: 'Price of 1 unit (in the given unit)', example: 150000, minimum: 0 })
  @Min(0, { message: 'IMPORT_FORM_ITEM_UNIT_PRICE_INVALID' })
  @IsDecimalWithScale(IMPORT_FORM_MONEY_SCALE, { message: 'IMPORT_FORM_ITEM_UNIT_PRICE_INVALID' })
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Free-text note, copied to every line added' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_ITEM_NOTE_INVALID' })
  note?: string;

  @ApiPropertyOptional({
    description:
      'Slug of the supplier of these lines. A supplier not yet attached to the material is ' +
      'attached automatically (same transaction); an unknown slug is rejected. Omitted: the ' +
      'only supplier of the material is used, or none when the material has 0 or several',
    example: 'sup-slug-1',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_ITEM_SUPPLIER_NOT_OF_MATERIAL' })
  supplierSlug?: string;

  @ApiPropertyOptional({
    description:
      'Expiry date of the goods (YYYY-MM-DD), not before the form date. Copied to the material ' +
      'batch created when the form is confirmed',
    example: '2027-10-12',
  })
  @IsOptional()
  @Transform(trim)
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID' },
  )
  @Matches(IMPORT_FORM_DATE_REGEX, { message: 'IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID' })
  expiryDate?: string;
}

/**
 * Kho lấy từ route (`/warehouses/:warehouseSlug/import-forms`), người lập lấy từ JWT, người duyệt
 * gán lúc xác nhận/huỷ, trạng thái luôn bắt đầu `DRAFT` — nên không field nào trong 4 thứ đó nằm
 * trong body. Phiếu nhập không gắn nhà cung cấp.
 * Tạo phiếu nháp RỖNG: hàng thêm sau qua `POST .../import-forms/:slug/items` (mỗi đơn vị 1 mã).
 * `total` không nằm trong body: server tính = Σ `amount` của các dòng.
 */
export class CreateImportFormRequestDto {
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
  @ApiPropertyOptional({
    description: 'S3 link returned by `POST .../import-forms/upload-file` — stored as-is',
    example:
      'https://my-bucket.s3.ap-southeast-1.amazonaws.com/import-forms/pn-1-1760400000000.pdf',
  })
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
 * PATCH partial phần đầu phiếu (chỉ khi phiếu còn `DRAFT`) — dòng KHÔNG sửa qua đây mà qua
 * `POST`/`DELETE .../items`. `version` bắt buộc — optimistic lock của `VersionedBase`, xem
 * `UpdateExampleRequestDto`.
 */
export class UpdateImportFormRequestDto extends PartialType(CreateImportFormRequestDto) {
  @ApiProperty({
    description: 'Version received from the most recent GET, used to detect conflicts',
    minimum: 1,
  })
  @IsNotEmpty({ message: 'IMPORT_FORM_VERSION_INVALID' })
  @IsInt({ message: 'IMPORT_FORM_VERSION_INVALID' })
  // `@Min(1)`: `version: 0` là falsy ⇒ TypeORM bỏ qua check optimistic lock (xem CLAUDE.md).
  @Min(1, { message: 'IMPORT_FORM_VERSION_INVALID' })
  version: number;
}

/** Body của `POST .../confirm` và `POST .../cancel` — chỉ mang `version` cho optimistic lock. */
export class ChangeImportFormStatusRequestDto {
  @ApiProperty({
    description: 'Version received from the most recent GET, used to detect conflicts',
    minimum: 1,
  })
  @IsNotEmpty({ message: 'IMPORT_FORM_VERSION_INVALID' })
  @IsInt({ message: 'IMPORT_FORM_VERSION_INVALID' })
  @Min(1, { message: 'IMPORT_FORM_VERSION_INVALID' })
  version: number;
}

/** Field sắp xếp của `GET /warehouses/{warehouseSlug}/import-forms` — map sang cột ở `buildSortOrder()` trong service. */
export enum ImportFormSortBy {
  CreatedAt = 'createdAt',
  Code = 'code',
}

export class GetAllImportFormRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ enum: ImportFormStatus })
  @IsOptional()
  @IsEnum(ImportFormStatus, { message: 'IMPORT_FORM_STATUS_INVALID' })
  status?: ImportFormStatus;

  @ApiPropertyOptional({
    description: 'Filter by form code (prefix match, case-insensitive)',
    example: 'PN-2026',
  })
  @IsOptional()
  @Transform(upper)
  @Matches(SEARCH_CODE_REGEX, { message: 'IMPORT_FORM_CODE_SEARCH_INVALID' })
  code?: string;

  @ApiPropertyOptional({
    description: 'Filter by invoice code (prefix match, case-insensitive)',
    example: 'HD-000',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_INVOICE_CODE_INVALID' })
  @MaxLength(IMPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'IMPORT_FORM_INVOICE_CODE_INVALID' })
  invoiceCode?: string;

  @ApiPropertyOptional({
    description: 'Filter by purchase order number (prefix match, case-insensitive)',
    example: 'PO-2026',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'IMPORT_FORM_PURCHASE_ORDER_INVALID' })
  @MaxLength(IMPORT_FORM_REFERENCE_MAX_LENGTH, { message: 'IMPORT_FORM_PURCHASE_ORDER_INVALID' })
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
    enum: ImportFormSortBy,
    default: ImportFormSortBy.CreatedAt,
  })
  @IsOptional()
  @IsEnum(ImportFormSortBy, { message: 'SORT_BY_INVALID' })
  sortBy?: ImportFormSortBy = ImportFormSortBy.CreatedAt;
}

export class GetImportFormAvailableMaterialRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by material code (prefix match, case-insensitive)',
    example: 'MAT-',
  })
  @IsOptional()
  @Transform(upper)
  @Matches(SEARCH_CODE_REGEX, { message: 'IMPORT_FORM_CODE_SEARCH_INVALID' })
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

export class ImportFormAvailableSupplierResponseDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;
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

  @ApiPropertyOptional({
    description:
      'Effective maximum stock threshold in this warehouse (in the base unit). Omitted when no maximum threshold (> 0) is configured.',
  })
  effectiveMaximumInventory?: number;

  @ApiProperty({
    type: [ImportFormAvailableSupplierResponseDto],
    description: 'Suppliers of the material — candidates for `items[].supplierSlug`',
  })
  suppliers: ImportFormAvailableSupplierResponseDto[];

  @ApiProperty({ type: [ImportFormAvailableUnitResponseDto] })
  units: ImportFormAvailableUnitResponseDto[];
}

export class ImportFormItemResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ description: 'Line number, in the order the lines were added (1-based)' })
  lineNo: number;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'Code of this unit of goods (null on lines written before item codes existed)',
    example: 'IT-WH-001-261126-000001',
  })
  code?: string | null;

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
  @ApiProperty({ description: 'Quantity in the given unit (1 on lines that carry a code)' })
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

  @AutoMap()
  @ApiPropertyOptional({ example: '2027-10-12', description: 'null = no expiry date' })
  expiryDate?: string | null;
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
    description: 'Lines, 1 per unit of goods, ordered by lineNo. Omitted in the list endpoint.',
  })
  items?: ImportFormItemResponseDto[];

  @ApiPropertyOptional({
    type: () => [ImportFormItemGroupResponseDto],
    description:
      'items grouped by (material, unit, unit price), in order of first appearance. Omitted in ' +
      'the list endpoint.',
  })
  groups?: ImportFormItemGroupResponseDto[];
}

/** Các dòng cùng (vật tư, đơn vị, đơn giá) gộp lại để hiển thị bảng phiếu. */
export class ImportFormItemGroupResponseDto {
  @ApiProperty()
  materialSlug: string;

  @ApiProperty()
  materialCode: string;

  @ApiProperty()
  materialName: string;

  @ApiProperty()
  unitSlug: string;

  @ApiProperty()
  unitCode: string;

  @ApiProperty()
  unitName: string;

  @ApiProperty()
  unitPrice: number;

  @ApiProperty({ description: 'Σ quantity of the lines, in the given unit' })
  quantity: number;

  @ApiProperty({ description: 'Σ baseQuantity of the lines, in the material base unit' })
  baseQuantity: number;

  @ApiProperty({ description: 'Σ amount of the lines' })
  amount: number;

  @ApiProperty({ type: [String], description: 'Codes of the lines (null codes are skipped)' })
  codes: string[];
}

export class AddImportFormItemResponseDto {
  @ApiProperty({
    type: [String],
    description: 'Codes generated by this request, 1 per unit added',
    example: ['IT-WH-001-261126-000001'],
  })
  codes: string[];

  @ApiProperty({ type: ImportFormResponseDto, description: 'The form after the change' })
  form: ImportFormResponseDto;
}
