import { IsNotEmpty, IsOptional, IsPositive, Matches, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { BUSINESS_CODE_REGEX } from 'src/shared/utils/code.util';
import { IsDecimalWithScale } from 'src/shared/utils/decimal.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateMaterialRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The business code of material', example: 'MAT-001' })
  @Transform(trim)
  @Matches(BUSINESS_CODE_REGEX, { message: 'MATERIAL_CODE_INVALID' })
  @IsNotEmpty({ message: 'MATERIAL_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiProperty({ description: 'The name of material', example: 'Găng tay cao su' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_NAME_IS_REQUIRED' })
  name: string;

  @ApiProperty({ description: 'Slug của MaterialType', example: 'x7fk2p9qab' })
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
  @ApiProperty({ description: 'Slug của đơn vị cơ sở (Unit)', example: 'unit-abc123' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_BASE_UNIT_SLUG_IS_REQUIRED' })
  baseUnitSlug: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Ngưỡng tồn tối thiểu mặc định', default: 0, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  minimumInventory?: number = 0;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Ngưỡng tồn tối đa mặc định', default: 0, example: 100 })
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
  @ApiPropertyOptional({ description: 'Ngưỡng tồn tối thiểu mặc định', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MINIMUM_INVENTORY_INVALID' })
  override minimumInventory?: number = undefined;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Ngưỡng tồn tối đa mặc định', example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_MAXIMUM_INVENTORY_INVALID' })
  @Min(0, { message: 'MATERIAL_MAXIMUM_INVENTORY_INVALID' })
  override maximumInventory?: number = undefined;
}

export class GetAllMaterialRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by the slug of the material type' })
  @IsOptional()
  @Transform(trim)
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Filter by exact business code', example: 'MAT-001' })
  @IsOptional()
  @Transform(upper)
  code?: string;

  @ApiPropertyOptional({ description: 'Filter by name (chứa chuỗi con)' })
  @IsOptional()
  @Transform(trim)
  name?: string;
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

  // Flatten từ quan hệ `type` bằng `forMember` — không lồng nguyên `MaterialTypeResponseDto` vào.
  @ApiPropertyOptional({ description: 'Slug của loại vật tư' })
  typeSlug?: string;

  @ApiPropertyOptional({ description: 'Mã loại vật tư' })
  typeCode?: string;

  @ApiPropertyOptional({ description: 'Tên loại vật tư' })
  typeName?: string;

  // Flatten từ quan hệ `baseUnit` — `undefined` khi vật tư chưa khai đơn vị cơ sở.
  @ApiPropertyOptional({ description: 'Slug của đơn vị cơ sở' })
  baseUnitSlug?: string;

  @ApiPropertyOptional({ description: 'Mã đơn vị cơ sở' })
  baseUnitCode?: string;

  @ApiPropertyOptional({ description: 'Tên đơn vị cơ sở' })
  baseUnitName?: string;
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

  @ApiPropertyOptional({ description: 'Filter by unit name (chứa chuỗi con)' })
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
  @ApiProperty({ description: 'Slug của Unit làm đơn vị quy đổi', example: 'unit-abc123' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_UNIT_SLUG_IS_REQUIRED' })
  unitSlug: string;

  @ApiProperty({
    description: 'Số ĐƠN VỊ CƠ SỞ trong 1 đơn vị này (1 BAO = 50 KG ⇒ 50)',
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
export class MaterialConversionUnitResponseDto {
  @ApiProperty({ example: 'unit-abc123' })
  unitSlug: string;

  @ApiProperty({ example: 'BAO' })
  unitCode: string;

  @ApiProperty({ example: 'Bao 50kg' })
  unitName: string;

  @AutoMap()
  @ApiProperty({ description: 'Số đơn vị cơ sở trong 1 đơn vị này', example: 50 })
  conversionRate: number;

  // Đơn vị cơ sở nay cũng là 1 dòng của bảng join (rate = 1) nên nó nằm trong CHÍNH danh sách này —
  // client cần cờ để hiển thị khác đi và để biết dòng nào không sửa/gỡ được.
  @ApiProperty({ description: 'Dòng này có phải ĐƠN VỊ CƠ SỞ của vật tư không', example: false })
  isBaseUnit: boolean;
}

/** Body của `POST /materials/:slug/convert` — quy đổi số lượng giữa 2 đơn vị của cùng 1 vật tư. */
export class ConvertMaterialQuantityRequestDto {
  @ApiProperty({ description: 'Số lượng cần quy đổi', example: 5 })
  @Type(() => Number)
  @IsDecimalWithScale(6, { message: 'MATERIAL_CONVERT_QUANTITY_INVALID' })
  @Min(0, { message: 'MATERIAL_CONVERT_QUANTITY_INVALID' })
  quantity: number;

  @ApiProperty({ description: 'Slug đơn vị NGUỒN (đơn vị cơ sở hoặc 1 đơn vị quy đổi đã gắn)' })
  @Transform(trim)
  @IsNotEmpty({ message: 'MATERIAL_UNIT_SLUG_IS_REQUIRED' })
  fromUnitSlug: string;

  @ApiProperty({ description: 'Slug đơn vị ĐÍCH (đơn vị cơ sở hoặc 1 đơn vị quy đổi đã gắn)' })
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

  @ApiProperty({ example: 'unit-bao' })
  fromUnitSlug: string;

  @ApiProperty({ example: 'BAO' })
  fromUnitCode: string;

  @ApiProperty({ description: 'Số lượng đầu vào', example: 5 })
  fromQuantity: number;

  @ApiProperty({ description: 'Số đơn vị cơ sở trong 1 đơn vị nguồn', example: 50 })
  fromConversionRate: number;

  @ApiProperty({ example: 'unit-kg' })
  toUnitSlug: string;

  @ApiProperty({ example: 'KG' })
  toUnitCode: string;

  @ApiProperty({ description: 'Số lượng sau quy đổi (làm tròn 6 chữ số thập phân)', example: 250 })
  toQuantity: number;

  @ApiProperty({ description: 'Số đơn vị cơ sở trong 1 đơn vị đích', example: 1 })
  toConversionRate: number;

  @ApiProperty({ example: 'unit-kg' })
  baseUnitSlug: string;

  @ApiProperty({ example: 'KG' })
  baseUnitCode: string;

  @ApiProperty({ description: 'Số lượng quy về đơn vị cơ sở', example: 250 })
  quantityInBaseUnit: number;
}
