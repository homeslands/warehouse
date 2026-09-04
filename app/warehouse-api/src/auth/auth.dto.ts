import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export enum TokenType {
  Access = 'access',
  Refresh = 'refresh',
}

export interface AuthJwtPayload {
  sub: string;
  jti: string;
  /**
   * Session id — ổn định suốt vòng đời một thiết bị, không đổi khi refresh token xoay vòng.
   * Ký vào cả access lẫn refresh token để `/auth/logout` biết cắt phiên nào, và để
   * reuse detection tra được phiên trong O(1). Optional vì token phát trước khi có claim
   * này vẫn phải parse được cho tới lúc hết hạn.
   */
  sid?: string;
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

export class LogoutAuthResponseDto {
  @ApiProperty({ description: 'Số phiên đã bị thu hồi' })
  revokedSessions: number;
}

export class SessionResponseDto {
  @ApiProperty({ description: 'Thời điểm phiên được tạo (đăng nhập)' })
  createdAt: string;

  @ApiProperty({ description: 'Lần cuối phiên này refresh token' })
  lastUsedAt: string;

  @ApiPropertyOptional({ description: 'IP ghi nhận lần gần nhất' })
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'User-Agent ghi nhận lần gần nhất' })
  userAgent?: string;

  @ApiProperty({ description: 'Có phải phiên đang gửi request này không' })
  isCurrent: boolean;
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
