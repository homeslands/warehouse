import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, VersionedResponseDto } from 'src/app/base.dto';
import { WAREHOUSE_CODE_REGEX, WAREHOUSE_PHONENUMBER_REGEX } from './warehouse.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateWarehouseRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The name of warehouse', example: 'Kho Hà Nội 1' })
  @Transform(trim)
  @IsNotEmpty({ message: 'WAREHOUSE_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'The business code of warehouse', example: 'WH-HN-01' })
  @Transform(trim)
  @Matches(WAREHOUSE_CODE_REGEX, { message: 'WAREHOUSE_CODE_INVALID' })
  @IsNotEmpty({ message: 'WAREHOUSE_CODE_IS_REQUIRED' })
  code: string;

  @AutoMap()
  @ApiProperty({ description: 'The address of warehouse', example: 'Số 1, Cầu Giấy, Hà Nội' })
  @Transform(trim)
  @IsNotEmpty({ message: 'WAREHOUSE_ADDRESS_IS_REQUIRED' })
  address: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The contact phone number', example: '02412345678' })
  @IsOptional()
  @Transform(trim)
  @Matches(WAREHOUSE_PHONENUMBER_REGEX, { message: 'WAREHOUSE_PHONENUMBER_INVALID' })
  phonenumber?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'The description of warehouse' })
  @IsOptional()
  description?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Whether the warehouse is in use', default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'WAREHOUSE_IS_ACTIVE_INVALID' })
  isActive?: boolean = true;
}

/**
 * PATCH đúng nghĩa REST: mọi field nghiệp vụ đều optional, field nào không gửi thì giữ nguyên giá
 * trị cũ (`PartialType` gắn `@IsOptional()` lên toàn bộ field thừa hưởng, validator vẫn chạy khi
 * field CÓ mặt). Chỉ `version` là bắt buộc — nó không phải dữ liệu nghiệp vụ mà là điều kiện của
 * optimistic lock.
 */
export class UpdateWarehouseRequestDto extends PartialType(CreateWarehouseRequestDto) {
  // `PartialType` sao chép cả property initializer của DTO cha, nên PATCH không gửi field này sẽ
  // âm thầm ghi đè giá trị mặc định lên bản ghi. Khai lại (kèm nguyên decorator, thiếu `@AutoMap()`
  // là automapper bỏ luôn field) và gán `undefined` để huỷ initializer đó — target ES2021 +
  // `useDefineForClassFields: false` ⇒ gán ở lớp con chạy sau constructor lớp cha.
  @AutoMap()
  @ApiPropertyOptional({ description: 'Whether the warehouse is in use' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'WAREHOUSE_IS_ACTIVE_INVALID' })
  override isActive?: boolean = undefined;

  @ApiProperty({
    description: 'Version nhận được từ lần GET gần nhất, dùng để phát hiện xung đột',
    minimum: 1,
  })
  @IsNotEmpty({ message: 'WAREHOUSE_VERSION_IS_REQUIRED' })
  @IsInt({ message: 'WAREHOUSE_VERSION_IS_REQUIRED' })
  // `@Min(1)`: TypeORM bọc cả khối so sánh version của optimistic lock trong
  // `if (result && lockMode === 'optimistic' && lockVersion)` (`SelectQueryBuilder.js:691-693`) —
  // `0` là falsy nên `version: 0` khiến check KHÔNG chạy và `save()` ghi đè vô điều kiện, chỉ với 1
  // request. `@IsNotEmpty`/`@IsInt` đều cho `0` qua; `@VersionColumn` luôn bắt đầu từ 1.
  @Min(1, { message: 'WAREHOUSE_VERSION_IS_REQUIRED' })
  version: number;
}

export class AssignWarehouseManagerRequestDto {
  @ApiProperty({
    description: 'Slug của user làm quản lý kho. Gửi `null` để bỏ phân công.',
    example: 'x7fk2p9qab',
    nullable: true,
    type: String,
  })
  @IsDefined({ message: 'WAREHOUSE_MANAGER_SLUG_IS_REQUIRED' })
  @ValidateIf((o: AssignWarehouseManagerRequestDto) => o.managerSlug !== null)
  @IsNotEmpty({ message: 'WAREHOUSE_MANAGER_SLUG_IS_REQUIRED' })
  managerSlug: string | null;

  @ApiProperty({
    description: 'Version nhận được từ lần GET gần nhất, dùng để phát hiện xung đột',
    minimum: 1,
  })
  @IsNotEmpty({ message: 'WAREHOUSE_VERSION_IS_REQUIRED' })
  @IsInt({ message: 'WAREHOUSE_VERSION_IS_REQUIRED' })
  // `@Min(1)`: TypeORM bọc cả khối so sánh version của optimistic lock trong
  // `if (result && lockMode === 'optimistic' && lockVersion)` (`SelectQueryBuilder.js:691-693`) —
  // `0` là falsy nên `version: 0` khiến check KHÔNG chạy và `save()` ghi đè vô điều kiện, chỉ với 1
  // request. `@IsNotEmpty`/`@IsInt` đều cho `0` qua; `@VersionColumn` luôn bắt đầu từ 1.
  @Min(1, { message: 'WAREHOUSE_VERSION_IS_REQUIRED' })
  version: number;
}

export class GetMyWarehouseRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active state', example: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'WAREHOUSE_IS_ACTIVE_INVALID' })
  isActive?: boolean;
}

export class GetAllWarehouseRequestDto extends GetMyWarehouseRequestDto {
  @ApiPropertyOptional({ description: 'Filter by the slug of the warehouse manager' })
  @IsOptional()
  managerSlug?: string;

  @ApiPropertyOptional({
    description: 'true = đã có quản lý, false = chưa có. Bỏ qua nếu đã truyền `managerSlug`.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'WAREHOUSE_HAS_MANAGER_INVALID' })
  hasManager?: boolean;
}

export class WarehouseResponseDto extends VersionedResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  code: string;

  @AutoMap()
  @ApiProperty()
  address: string;

  @AutoMap()
  @ApiPropertyOptional()
  phonenumber?: string;

  @AutoMap()
  @ApiPropertyOptional()
  description?: string;

  @AutoMap()
  @ApiProperty()
  isActive: boolean;

  // Flatten từ quan hệ `manager` bằng `forMember` (giống `UserResponseDto.roleSlug`) — không
  // `@AutoMap()`, và không lồng nguyên `UserResponseDto` vào response.
  @ApiPropertyOptional({ description: 'Slug của quản lý kho, bỏ trống nếu chưa phân công' })
  managerSlug?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại của quản lý kho' })
  managerPhonenumber?: string;
}
