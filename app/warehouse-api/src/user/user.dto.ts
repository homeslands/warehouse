import { IsEmail, IsISO8601, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { VN_PHONENUMBER_REGEX } from './user.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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

export class GetAllUserRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by role slug', example: 'admin' })
  @IsOptional()
  roleSlug?: string;
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
