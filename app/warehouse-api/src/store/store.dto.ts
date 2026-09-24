import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { STORE_CODE_REGEX, STORE_PHONENUMBER_REGEX, STORE_TAX_CODE_REGEX } from './store.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateStoreRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The display name of the store', example: 'Cửa hàng Hà Nội 1' })
  @Transform(trim)
  @IsNotEmpty({ message: 'STORE_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'The business code of the store', example: 'ST-HN-01' })
  @Transform(trim)
  @Matches(STORE_CODE_REGEX, { message: 'STORE_CODE_INVALID' })
  @IsNotEmpty({ message: 'STORE_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiProperty({
    description: 'The full legal entity name printed on invoices',
    example: 'Công ty TNHH ABC',
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'STORE_LEGAL_NAME_IS_REQUIRED' })
  legalName: string;

  @AutoMap()
  @ApiProperty({ description: 'The tax code (MST) of the store', example: '0101234567' })
  @Transform(trim)
  @Matches(STORE_TAX_CODE_REGEX, { message: 'STORE_TAX_CODE_INVALID' })
  @IsNotEmpty({ message: 'STORE_TAX_CODE_IS_REQUIRED' })
  taxCode: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'The registered address printed on invoices',
    example: 'Số 1, Cầu Giấy, Hà Nội',
  })
  @IsOptional()
  @Transform(trim)
  invoiceAddress?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The contact phone number', example: '02412345678' })
  @IsOptional()
  @Transform(trim)
  @Matches(STORE_PHONENUMBER_REGEX, { message: 'STORE_PHONENUMBER_INVALID' })
  phonenumber?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The contact email', example: 'lienhe@abc.vn' })
  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'STORE_EMAIL_INVALID' })
  email?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description: 'The physical address of the store, may differ from invoiceAddress',
    example: 'Số 2, Ba Đình, Hà Nội',
  })
  @IsOptional()
  @Transform(trim)
  address?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Whether the store is in use', default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'STORE_IS_ACTIVE_INVALID' })
  isActive?: boolean = true;
}

/**
 * PATCH đúng nghĩa REST: mọi field nghiệp vụ đều optional, field nào không gửi thì giữ nguyên giá
 * trị cũ (`PartialType` gắn `@IsOptional()` lên toàn bộ field thừa hưởng, validator vẫn chạy khi
 * field CÓ mặt).
 */
export class UpdateStoreRequestDto extends PartialType(CreateStoreRequestDto) {
  // `PartialType` sao chép cả property initializer của DTO cha (`isActive = true`), nên PATCH không
  // gửi `isActive` sẽ âm thầm BẬT LẠI cửa hàng đã ngừng hoạt động. Gán `undefined` ở lớp con để huỷ
  // initializer đó (target ES2021 + `useDefineForClassFields: false` ⇒ gán này chạy sau constructor
  // của lớp cha).
  @AutoMap()
  @ApiPropertyOptional({ description: 'Whether the store is in use' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'STORE_IS_ACTIVE_INVALID' })
  override isActive?: boolean = undefined;
}

export class AssignStoreWarehouseRequestDto {
  @ApiProperty({
    description: 'Slug của kho gắn với cửa hàng. Gửi `null` để gỡ gắn kết.',
    example: 'x7fk2p9qab',
    nullable: true,
    type: String,
  })
  @IsDefined({ message: 'STORE_WAREHOUSE_SLUG_IS_REQUIRED' })
  @ValidateIf((o: AssignStoreWarehouseRequestDto) => o.warehouseSlug !== null)
  @IsNotEmpty({ message: 'STORE_WAREHOUSE_SLUG_IS_REQUIRED' })
  warehouseSlug: string | null;
}

export class GetAllStoreRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active state', example: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'STORE_IS_ACTIVE_INVALID' })
  isActive?: boolean;
}

export class StoreResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiProperty()
  legalName: string;

  @AutoMap()
  @ApiProperty()
  taxCode: string;

  @AutoMap()
  @ApiPropertyOptional()
  invoiceAddress?: string;

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
  @ApiProperty()
  isActive: boolean;

  // Flatten từ quan hệ `warehouse` bằng `forMember` (giống `WarehouseResponseDto.managerSlug`) —
  // không @AutoMap() để automapper không tự map nguyên entity `Warehouse` ra ngoài.
  @ApiPropertyOptional({ description: 'Slug của kho gắn với cửa hàng' })
  warehouseSlug?: string;

  @ApiPropertyOptional({ description: 'Tên kho gắn với cửa hàng' })
  warehouseName?: string;
}
