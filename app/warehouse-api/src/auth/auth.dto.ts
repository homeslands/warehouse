import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export enum TokenType {
  Access = 'access',
  Refresh = 'refresh',
}

export interface AuthJwtPayload {
  sub: string;
  jti: string;
  // Phân biệt access/refresh token: 2 loại token dùng chung 1 JWT_SECRET nên nếu không có claim
  // này thì refresh token cũng dùng được như access token (và ngược lại). Optional để các token
  // đã phát hành trước khi thêm claim vẫn còn hiệu lực tới khi hết hạn.
  type?: TokenType;
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

export class RefreshAuthRequestDto {
  @ApiProperty({ description: 'Refresh token nhận được từ lần login/refresh gần nhất' })
  @IsNotEmpty({ message: 'REFRESH_TOKEN_IS_REQUIRED' })
  refreshToken: string;
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
