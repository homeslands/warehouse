import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { USER_SORT_FIELDS, USER_SORT_REGEX, VN_PHONENUMBER_REGEX } from './user.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

// `IsISO8601` một mình còn nhận cả `2024-01-01T10:00:00Z`; cột là DATE nên chỉ nhận đúng ngày.
const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateUserRequestDto {
  @AutoMap()
  @ApiProperty({
    description: 'Phone number',
    example: '0900000000',
    pattern: VN_PHONENUMBER_REGEX.source,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(VN_PHONENUMBER_REGEX, { message: 'USER_PHONENUMBER_INVALID' })
  @IsNotEmpty({ message: 'USER_PHONENUMBER_IS_REQUIRED' })
  phonenumber: string;

  @AutoMap()
  @ApiProperty({ description: 'First name', example: 'Văn A' })
  @Transform(trim)
  @IsNotEmpty({ message: 'USER_FIRST_NAME_IS_REQUIRED' })
  firstName: string;

  @AutoMap()
  @ApiProperty({ description: 'Last name', example: 'Nguyễn' })
  @Transform(trim)
  @IsNotEmpty({ message: 'USER_LAST_NAME_IS_REQUIRED' })
  lastName: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '1990-05-20' })
  @IsOptional()
  @Transform(trim)
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'USER_DOB_INVALID' })
  @Matches(DOB_REGEX, { message: 'USER_DOB_INVALID' })
  dob?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Email', example: 'a.nguyen@example.com' })
  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'USER_EMAIL_INVALID' })
  email?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Address', example: 'Số 2, Ba Đình, Hà Nội' })
  @IsOptional()
  @Transform(trim)
  address?: string;

  @ApiProperty({ description: 'Password', example: 'password' })
  @IsNotEmpty({ message: 'USER_PASSWORD_IS_REQUIRED' })
  password: string;

  @ApiProperty({ description: 'Role slug to assign', example: 'admin' })
  @IsNotEmpty({ message: 'USER_ROLE_SLUG_IS_REQUIRED' })
  roleSlug: string;
}

/**
 * `PATCH /users/{userSlug}` — chỉ hồ sơ. Mật khẩu và role có endpoint riêng (`.../change-password`,
 * `.../change-role`) vì cả hai phải thu hồi phiên của user; `isActive` đi qua `PUT /users/{slug}/lock|unlock`.
 */
export class UpdateUserRequestDto extends PartialType(
  OmitType(CreateUserRequestDto, ['password', 'roleSlug'] as const),
) {}

export class ChangeUserRoleRequestDto {
  @ApiProperty({ description: 'Slug của role mới', example: 'supervisor' })
  @IsNotEmpty({ message: 'USER_ROLE_SLUG_IS_REQUIRED' })
  roleSlug: string;
}

// Query string `?sort=a` ra string, `?sort=a&sort=b` mới ra mảng — gói lại cho `@IsArray`.
const toArray = ({ value }: { value: unknown }) =>
  value === undefined || Array.isArray(value) ? value : [value];

export class GetAllUserRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by role slug', example: 'admin' })
  @IsOptional()
  roleSlug?: string;

  @ApiPropertyOptional({
    description: 'Tìm theo tên (chứa chuỗi, khớp họ, tên hoặc "họ tên")',
    example: 'Nguyễn Văn',
  })
  @IsOptional()
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional({ description: 'Tìm theo số điện thoại (chứa chuỗi)', example: '0900' })
  @IsOptional()
  @Transform(trim)
  phonenumber?: string;

  @ApiPropertyOptional({
    description: 'Chỉ user là THÀNH VIÊN của kho này (không tính kho user làm manager)',
    example: 'x7fk2p9qab',
  })
  @IsOptional()
  warehouseSlug?: string;

  @ApiPropertyOptional({
    description:
      'Ngày tạo tài khoản từ (bao gồm). `YYYY-MM-DD` tính từ 00:00 giờ server, hoặc ISO 8601 đầy đủ.',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'USER_START_DATE_INVALID' })
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Ngày tạo tài khoản đến (bao gồm). `YYYY-MM-DD` tính hết ngày đó, hoặc ISO 8601 đầy đủ.',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString({}, { message: 'USER_END_DATE_INVALID' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Ngày sinh (khớp đúng, YYYY-MM-DD)', example: '1990-05-20' })
  @IsOptional()
  @Transform(trim)
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'USER_BIRTHDAY_INVALID' })
  @Matches(DOB_REGEX, { message: 'USER_BIRTHDAY_INVALID' })
  birthday?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái tài khoản (`true` = đang hoạt động, `false` = đã khoá)',
    example: true,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'USER_IS_ACTIVE_INVALID' })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: `Sort \`field:ASC|DESC\`, lặp lại để sort nhiều cấp. Field: ${Object.keys(
      USER_SORT_FIELDS,
    ).join(', ')}. Mặc định \`createdAt:DESC\`.`,
    example: ['lastName:ASC', 'firstName:ASC'],
    isArray: true,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray({ message: 'USER_SORT_INVALID' })
  @Matches(USER_SORT_REGEX, { each: true, message: 'USER_SORT_INVALID' })
  sort?: string[];
}

export class UserRoleDto {
  @ApiProperty({ example: 'x7fk2p9q' })
  slug: string;

  @ApiProperty({ example: 'SUPERVISOR' })
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ description: 'Cấp của role — số lớn = cấp cao', example: 10 })
  level: number;
}

// Kho mà user là THÀNH VIÊN (`warehouse_member_tbl`) — không gồm kho user làm manager.
export class UserWarehouseDto {
  @ApiProperty({ example: 'x7fk2p9qab' })
  slug: string;

  @ApiProperty({ example: 'WH-HN-01' })
  code: string;

  @ApiProperty({ example: 'Kho Hà Nội 1' })
  name: string;
}

export class UserResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  phonenumber: string;

  @AutoMap()
  @ApiProperty()
  firstName: string;

  @AutoMap()
  @ApiProperty()
  lastName: string;

  @AutoMap()
  @ApiPropertyOptional({ example: '1990-05-20' })
  dob?: string;

  @AutoMap()
  @ApiPropertyOptional()
  email?: string;

  @AutoMap()
  @ApiPropertyOptional()
  address?: string;

  @AutoMap()
  @ApiProperty()
  isActive: boolean;

  @AutoMap()
  @ApiProperty()
  roleSlug: string;

  @AutoMap()
  @ApiProperty()
  roleName: string;

  // Dựng bằng `forMember` trong `user.mapper.ts` — không `@AutoMap()`.
  @ApiPropertyOptional({ type: () => UserRoleDto })
  role?: UserRoleDto;

  /**
   * Chỉ có khi query nạp `warehouseMembers.warehouse` (hiện là `GET /users` và
   * `GET /warehouses/{slug}/available-members`); các endpoint khác không trả field này.
   */
  @ApiPropertyOptional({ type: () => UserWarehouseDto, isArray: true })
  warehouses?: UserWarehouseDto[];
}

export class ChangeUserPasswordRequestDto {
  @ApiProperty({ description: 'Mật khẩu mới cấp cho user', example: 'new-password' })
  @IsNotEmpty({ message: 'USER_NEW_PASSWORD_IS_REQUIRED' })
  newPassword: string;
}

export class ChangeUserPasswordResponseDto {
  @ApiProperty({
    description: 'Slug của user vừa bị đổi mật khẩu — mọi phiên của user đó đã bị thu hồi.',
    example: 'x7fk2p9q',
  })
  userSlug: string;
}
