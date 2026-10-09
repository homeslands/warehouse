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
  @ApiProperty({ description: 'First name', example: 'Van A' })
  @Transform(trim)
  @IsNotEmpty({ message: 'USER_FIRST_NAME_IS_REQUIRED' })
  firstName: string;

  @AutoMap()
  @ApiProperty({ description: 'Last name', example: 'Nguyen' })
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
  @ApiPropertyOptional({ description: 'Address', example: 'No. 2, Ba Dinh, Ha Noi' })
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
  @ApiProperty({ description: 'Slug of the new role', example: 'supervisor' })
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
    description: 'Search by name (substring match on last name, first name, or "last first")',
    example: 'Nguyen Van',
  })
  @IsOptional()
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional({ description: 'Search by phone number (substring match)', example: '0900' })
  @IsOptional()
  @Transform(trim)
  phonenumber?: string;

  @ApiPropertyOptional({
    description: 'Only users who are MEMBERS of this warehouse (excluding the warehouse manager)',
    example: 'x7fk2p9qab',
  })
  @IsOptional()
  warehouseSlug?: string;

  @ApiPropertyOptional({
    description:
      'Account creation date from (inclusive). `YYYY-MM-DD` counts from 00:00 server time, or a ' +
      'full ISO 8601 timestamp.',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'USER_START_DATE_INVALID' })
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Account creation date to (inclusive). `YYYY-MM-DD` covers the whole day, or a full ' +
      'ISO 8601 timestamp.',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString({}, { message: 'USER_END_DATE_INVALID' })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Date of birth (exact match, YYYY-MM-DD)',
    example: '1990-05-20',
  })
  @IsOptional()
  @Transform(trim)
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'USER_BIRTHDAY_INVALID' })
  @Matches(DOB_REGEX, { message: 'USER_BIRTHDAY_INVALID' })
  birthday?: string;

  @ApiPropertyOptional({
    description: 'Filter by account status (`true` = active, `false` = locked)',
    example: true,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'USER_IS_ACTIVE_INVALID' })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: `Sort \`field:ASC|DESC\`, repeat for multi-level sorting. Field: ${Object.keys(
      USER_SORT_FIELDS,
    ).join(', ')}. Default \`createdAt:DESC\`.`,
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

  @ApiProperty({ description: 'Role level — a larger number means a higher level', example: 10 })
  level: number;
}

// Kho mà user là THÀNH VIÊN (`warehouse_member_tbl`) — không gồm kho user làm manager.
export class UserWarehouseDto {
  @ApiProperty({ example: 'x7fk2p9qab' })
  slug: string;

  @ApiProperty({ example: 'WH-HN-01' })
  code: string;

  @ApiProperty({ example: 'Ha Noi Warehouse 1' })
  name: string;
}

// Kho trong `GET /auth/me`: gồm cả kho user làm manager lẫn kho user là thành viên.
export class UserProfileWarehouseDto extends UserWarehouseDto {
  @ApiProperty({ description: '`true` = manager of the warehouse, `false` = regular member' })
  isManager: boolean;
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
  @ApiProperty({ description: 'New password to assign to the user', example: 'new-password' })
  @IsNotEmpty({ message: 'USER_NEW_PASSWORD_IS_REQUIRED' })
  newPassword: string;
}

export class ChangeUserPasswordResponseDto {
  @ApiProperty({
    description:
      'Slug of the user whose password was just changed — all of their sessions have been ' +
      'revoked.',
    example: 'x7fk2p9q',
  })
  userSlug: string;
}
