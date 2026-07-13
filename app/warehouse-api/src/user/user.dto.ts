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
