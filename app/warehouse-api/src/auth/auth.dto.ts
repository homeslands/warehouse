import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export interface AuthJwtPayload {
  sub: string;
  jti: string;
  scope?: string;
  exp?: number;
}

export class LoginAuthRequestDto {
  @ApiProperty({ description: 'Phone number', example: '0376295216' })
  @IsNotEmpty({ message: 'PHONENUMBER_IS_REQUIRED' })
  phonenumber: string;

  @ApiProperty({ description: 'Password', example: 'password' })
  @IsNotEmpty({ message: 'PASSWORD_IS_REQUIRED' })
  password: string;
}

export class RegisterAuthRequestDto {
  @ApiProperty({ description: 'Phone number', example: '0900000000' })
  @IsNotEmpty({ message: 'PHONENUMBER_IS_REQUIRED' })
  phonenumber: string;

  @ApiProperty({ description: 'Password', example: 'password' })
  @IsNotEmpty({ message: 'PASSWORD_IS_REQUIRED' })
  password: string;
}

export class LoginAuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  expireTime: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expireTimeRefreshToken: string;
}
