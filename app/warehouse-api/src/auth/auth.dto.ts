import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { CurrentUserDto } from 'src/user/user.decorator';

export enum TokenType {
  Access = 'access',
  Refresh = 'refresh',
}

export interface ProfileResponseDto extends CurrentUserDto {
  userName: string;
}

export interface AuthJwtPayload {
  sub: string;
  jti: string;
  /**
   * Session id — ổn định suốt vòng đời một thiết bị, KHÔNG đổi khi `/auth/refresh` ký lại token.
   * Ký vào cả access lẫn refresh token, nên `BLACK_LIST_{uid}_{sid}` ghi lúc logout giết được cả
   * cặp (2 loại token mang `jti` khác nhau nên không key theo `jti` được). Optional vì token phát
   * trước khi có claim này vẫn phải parse được cho tới lúc hết hạn.
   */
  sid?: string;
  /**
   * `Role.name` của user, ký vào ACCESS token lúc login/refresh. `AuthorityGuard` (bypass
   * `SUPER_ADMIN`) và `RoleBasedSerializationInterceptor` cần nó ở mọi request, mà cache Redis chỉ
   * còn chứa quyền — xem `docs/specs/rbac.md`.
   */
  role?: string;
  // Phân biệt access/refresh token: 2 loại token dùng chung 1 JWT_SECRET nên nếu không có claim
  // này thì refresh token cũng dùng được như access token (và ngược lại). Optional để các token
  // đã phát hành trước khi thêm claim vẫn còn hiệu lực tới khi hết hạn.
  type?: TokenType;
  exp?: number;
  /**
   * Không set tay lúc ký — `jsonwebtoken` tự chèn vào mọi token. Khai ở đây để phía verify đọc
   * được, phục vụ check `TOKEN_IAT_AVAILABLE_{uid}` (xem `docs/specs/token-revocation.md`).
   */
  iat?: number;
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
  // Deny-list không còn đếm được số phiên đang mở: `1` = đã ghi key thu hồi, `0` = không ghi được
  // (token không có claim `sid`). Giữ nguyên tên field để không phá client.
  @ApiProperty({ description: 'Đã ghi key thu hồi hay chưa (1|0)' })
  revokedSessions: number;
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

export class ChangePasswordRequestDto {
  @ApiProperty({
    description:
      'Mật khẩu hiện tại của chính mình. BẮT BUỘC — endpoint này chỉ dùng để tự đổi mật khẩu, ' +
      'admin/manager đổi hộ người khác thì gọi `POST /users/{userSlug}/change-password`.',
    example: 'old-password',
  })
  @IsNotEmpty({ message: 'CURRENT_PASSWORD_IS_REQUIRED' })
  currentPassword: string;

  @ApiProperty({ description: 'Mật khẩu mới', example: 'new-password' })
  @IsNotEmpty({ message: 'NEW_PASSWORD_IS_REQUIRED' })
  newPassword: string;
}

export class ChangePasswordResponseDto {
  @ApiProperty({
    type: LoginAuthResponseDto,
    description:
      'Cặp token mới (mang `sid` mới) — đổi mật khẩu thu hồi mọi phiên của chính mình, cặp token ' +
      'này để không bị văng ra khỏi app ngay sau khi đổi.',
  })
  tokens: LoginAuthResponseDto;
}
