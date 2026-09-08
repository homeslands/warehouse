import { IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';

export class CreateUserRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'Phone number', example: '0900000000' })
  @IsNotEmpty({ message: 'USER_PHONENUMBER_IS_REQUIRED' })
  phonenumber: string;

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
