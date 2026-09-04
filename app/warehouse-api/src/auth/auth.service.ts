import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { User } from 'src/user/user.entity';
import {
  AuthJwtPayload,
  LoginAuthRequestDto,
  LoginAuthResponseDto,
  LogoutAuthResponseDto,
  RefreshAuthRequestDto,
  SessionResponseDto,
  TokenType,
} from './auth.dto';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';
import { checkActiveUser } from './auth.utils';
import { UserService } from 'src/user/user.service';
import { IssuedSession, RefreshTokenService, SessionMeta } from './refresh-token.service';

@Injectable()
export class AuthService {
  private readonly duration: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {
    this.duration = parseInt(this.configService.get('DURATION'), 10);
  }

  async validateUser(phonenumber: string, pass: string): Promise<User | null> {
    const user = await this.userService.findByPhoneNumber(phonenumber);
    if (!user) return null;
    if (user.phonenumber === 'default-customer') return null;

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) return null;
    return user;
  }

  async login(
    loginAuthDto: LoginAuthRequestDto,
    meta: SessionMeta = {},
  ): Promise<LoginAuthResponseDto> {
    const user = await this.validateUser(loginAuthDto.phonenumber, loginAuthDto.password);
    if (!user) throw new AuthException(AuthValidation.INVALID_CREDENTIALS);

    checkActiveUser(user);

    const session = await this.refreshTokenService.createSession(user.id, meta);
    return this.buildTokenPair(user.id, session);
  }

  /**
   * Đổi refresh token còn hiệu lực lấy cặp token mới (rotation thật — token cũ chỉ còn sống
   * trong cửa sổ grace ngắn để phục vụ refresh song song, sau đó dùng lại là bị coi như bị
   * đánh cắp và cả phiên bị thu hồi).
   */
  async refresh(
    refreshAuthDto: RefreshAuthRequestDto,
    meta: SessionMeta = {},
  ): Promise<LoginAuthResponseDto> {
    const payload = this.verifyRefreshToken(refreshAuthDto.refreshToken);

    // Kiểm tra user TRƯỚC khi ghi Redis: nếu xoay vòng trước rồi mới phát hiện user bị khoá
    // thì jti cũ đã chết mà token mới không được trả về, phiên thành gạch vụn.
    const user = await this.userService.findByIdWithAuthorities(payload.sub);
    if (!user) throw new AuthException(AuthValidation.INVALID_REFRESH_TOKEN);
    if (!user.isActive) {
      await this.refreshTokenService.revokeAllForUser(user.id);
      checkActiveUser(user);
    }

    const outcome = await this.refreshTokenService.rotate(user.id, payload.jti, payload.sid, meta);

    switch (outcome.status) {
      case 'rotated':
      case 'grace':
        return this.buildTokenPair(user.id, outcome);
      case 'reused':
        throw new AuthException(AuthValidation.REFRESH_TOKEN_REUSED);
      case 'revoked':
        throw new AuthException(AuthValidation.REFRESH_TOKEN_REVOKED);
      case 'session_expired':
        throw new AuthException(AuthValidation.SESSION_EXPIRED);
      default:
        throw new AuthException(AuthValidation.INVALID_REFRESH_TOKEN);
    }
  }

  async logout(userId: string, sessionId?: string): Promise<LogoutAuthResponseDto> {
    // Token phát trước khi có claim `sid` không xác định được phiên — trả no-op thay vì lỗi
    // để client cũ không vỡ; access token đó cũng chỉ còn sống tối đa `DURATION`.
    if (!sessionId) return { revokedSessions: 0 };

    const revokedSessions = await this.refreshTokenService.revokeSession(userId, sessionId);
    return { revokedSessions };
  }

  async logoutAll(userId: string): Promise<LogoutAuthResponseDto> {
    const revokedSessions = await this.refreshTokenService.revokeAllForUser(userId);
    return { revokedSessions };
  }

  async listSessions(userId: string, currentSessionId?: string): Promise<SessionResponseDto[]> {
    const sessions = await this.refreshTokenService.listActiveSessions(userId);
    return sessions.map((session) => ({
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isCurrent: session.sessionId === currentSessionId,
    }));
  }

  private verifyRefreshToken(refreshToken: string): AuthJwtPayload {
    let payload: AuthJwtPayload;
    try {
      payload = this.jwtService.verify<AuthJwtPayload>(refreshToken);
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new AuthException(AuthValidation.REFRESH_TOKEN_EXPIRED);
      }
      throw new AuthException(AuthValidation.INVALID_REFRESH_TOKEN);
    }

    // Access token và refresh token dùng chung JWT_SECRET nên phải chặn access token bị gửi vào
    // đây để đổi lấy phiên mới (xem claim `type` trong auth.dto.ts).
    if (payload.type !== TokenType.Refresh) {
      throw new AuthException(AuthValidation.INVALID_REFRESH_TOKEN);
    }

    return payload;
  }

  /**
   * Access token và refresh token mang `jti` KHÁC nhau: `jti` của refresh token là khoá Redis,
   * còn access token chỉ cần một định danh riêng cho mỗi lần ký (nhánh grace ký lại access token
   * nhiều lần cho cùng một refresh token).
   */
  private buildTokenPair(userId: string, session: IssuedSession): LoginAuthResponseDto {
    const now = Math.floor(Date.now() / 1000);

    const accessPayload: AuthJwtPayload = {
      sub: userId,
      jti: uuidv4(),
      sid: session.sessionId,
      type: TokenType.Access,
      exp: now + this.duration,
    };

    const refreshPayload: AuthJwtPayload = {
      sub: userId,
      jti: session.jti,
      sid: session.sessionId,
      type: TokenType.Refresh,
      exp: now + session.ttlSeconds,
    };

    return {
      accessToken: this.jwtService.sign(accessPayload),
      expireTime: moment().add(this.duration, 'seconds').toString(),
      refreshToken: this.jwtService.sign(refreshPayload),
      expireTimeRefreshToken: moment().add(session.ttlSeconds, 'seconds').toString(),
    };
  }
}
