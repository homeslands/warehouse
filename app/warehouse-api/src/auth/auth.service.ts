import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { User } from 'src/user/user.entity';
import {
  AuthJwtPayload,
  ChangePasswordRequestDto,
  ChangePasswordResponseDto,
  LoginAuthRequestDto,
  LoginAuthResponseDto,
  LogoutAuthResponseDto,
  RefreshAuthRequestDto,
  TokenType,
} from './auth.dto';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';
import { checkActiveUser } from './auth.utils';
import { UserService } from 'src/user/user.service';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { CurrentUserDto } from 'src/user/user.decorator';
import { TokenRevocationService } from './token-revocation.service';

@Injectable()
export class AuthService {
  private readonly duration: number;
  private readonly refreshableDuration: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {
    this.duration = parseInt(this.configService.get('DURATION'), 10);
    this.refreshableDuration = parseInt(this.configService.get('REFRESHABLE_DURATION'), 10);
  }

  async validateUser(phonenumber: string, pass: string): Promise<User | null> {
    const user = await this.userService.findByPhoneNumber(phonenumber);
    if (!user) return null;
    if (user.phonenumber === 'default-customer') return null;

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) return null;
    return user;
  }

  // Deny-list: login KHÔNG ghi gì vào Redis. `sid` chỉ là định danh phiên ký vào token, chỉ được
  // dùng tới khi có ai đó thu hồi nó.
  async login(loginAuthDto: LoginAuthRequestDto): Promise<LoginAuthResponseDto> {
    const user = await this.validateUser(loginAuthDto.phonenumber, loginAuthDto.password);
    if (!user) throw new AuthException(AuthValidation.INVALID_CREDENTIALS);

    checkActiveUser(user);

    return this.buildTokenPair(user.id, uuidv4());
  }

  /**
   * Ký lại CẢ access lẫn refresh token với `exp` mới, giữ nguyên `sid`. Không xoay vòng, không
   * ghi Redis: refresh token cũ vẫn sống tới `exp` của chính nó (xem "Đánh đổi đã chấp nhận"
   * trong `docs/specs/token-revocation.md`).
   */
  async refresh(refreshAuthDto: RefreshAuthRequestDto): Promise<LoginAuthResponseDto> {
    const payload = this.verifyRefreshToken(refreshAuthDto.refreshToken);

    // Không có `sid` thì không thể thu hồi được token sẽ phát ra — từ chối thay vì mở một phiên
    // vĩnh viễn không logout được. Mọi refresh token do code này ký đều có `sid`.
    if (!payload.sid) throw new AuthException(AuthValidation.INVALID_REFRESH_TOKEN);

    if (await this.tokenRevocationService.isRevoked(payload.sub, payload.sid, payload.iat)) {
      throw new AuthException(AuthValidation.REFRESH_TOKEN_REVOKED);
    }

    const user = await this.userService.findByIdWithAuthorities(payload.sub);
    if (!user) throw new AuthException(AuthValidation.INVALID_REFRESH_TOKEN);
    if (!user.isActive) {
      // User bị khoá: giết luôn mọi token khác của họ, không chỉ lần refresh này.
      await this.tokenRevocationService.revokeAllTokensForUser(user.id);
      checkActiveUser(user);
    }

    return this.buildTokenPair(user.id, payload.sid);
  }

  async logout(userId: string, sessionId?: string): Promise<LogoutAuthResponseDto> {
    // Token phát trước khi có claim `sid` không xác định được phiên — trả no-op thay vì lỗi
    // để client cũ không vỡ; access token đó cũng chỉ còn sống tối đa `DURATION`.
    if (!sessionId) return { revokedSessions: 0 };

    await this.tokenRevocationService.revokeSession(userId, sessionId);
    return { revokedSessions: 1 };
  }

  /**
   * Cutoff (`iat`) chỉ có độ phân giải 1 giây nên token ký CÙNG GIÂY với lần gọi này sẽ lọt —
   * và token lọt đó chính là token đang nằm trong tay người vừa bấm "đăng xuất mọi thiết bị"
   * (đã verify thật: cả chuỗi login → logout-all chạy trong 1 giây thì `/auth/me` vẫn 200).
   * Nên chặn thêm phiên hiện tại bằng key blacklist theo `sid` — không phụ thuộc `iat`.
   * Các thiết bị khác vẫn do cutoff lo, token của chúng phát từ trước nên không dính khe hở này.
   */
  async logoutAll(userId: string, sessionId?: string): Promise<LogoutAuthResponseDto> {
    await this.tokenRevocationService.revokeAllTokensForUser(userId);
    if (sessionId) await this.tokenRevocationService.revokeSession(userId, sessionId);
    return { revokedSessions: 1 };
  }

  /**
   * Tự đổi mật khẩu của chính mình (`POST /auth/change-password`) — chỉ cần đã đăng nhập, nhưng
   * BẮT BUỘC nhập đúng mật khẩu hiện tại (`ChangePasswordRequestDto` validate `currentPassword`,
   * nên tới được đây là đã có giá trị). Không bao giờ chạm tới tài khoản người khác.
   */
  async changeOwnPassword(
    currentUser: CurrentUserDto,
    dto: ChangePasswordRequestDto,
  ): Promise<ChangePasswordResponseDto> {
    const user = await this.userService.findById(currentUser.userId);
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) throw new AuthException(AuthValidation.CURRENT_PASSWORD_INCORRECT);

    await this.userService.updatePassword(user.id, dto.newPassword);

    // Thu hồi TRƯỚC khi ký cặp token mới: cutoff lấy đúng `now`, nên token ký sau đó có
    // `iat >= cutoff` và sống sót; ký trước rồi mới thu hồi thì token vừa phát có thể rơi vào giây
    // trước cutoff và chết ngay lập tức.
    await this.tokenRevocationService.revokeAllTokensForUser(user.id);

    // Khe hở 1 giây của cutoff (xem `logoutAll`): token hiện tại của chính người gọi ký cùng giây
    // với lần thu hồi này sẽ lọt qua — chặn thêm theo `sid` cũ. Cặp token trả về mang `sid` mới nên
    // không dính key blacklist này.
    if (currentUser.sessionId) {
      await this.tokenRevocationService.revokeSession(user.id, currentUser.sessionId);
    }
    return { tokens: this.buildTokenPair(user.id, uuidv4()) };
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
   * Access và refresh token mang `jti` khác nhau (mỗi lần ký là một định danh riêng) nhưng CÙNG
   * `sid` — `sid` mới là thứ `BLACK_LIST_{uid}_{sid}` dùng để giết cả cặp lúc logout.
   */
  private buildTokenPair(userId: string, sessionId: string): LoginAuthResponseDto {
    const now = Math.floor(Date.now() / 1000);

    const accessPayload: AuthJwtPayload = {
      sub: userId,
      jti: uuidv4(),
      sid: sessionId,
      type: TokenType.Access,
      exp: now + this.duration,
    };

    const refreshPayload: AuthJwtPayload = {
      sub: userId,
      jti: uuidv4(),
      sid: sessionId,
      type: TokenType.Refresh,
      exp: now + this.refreshableDuration,
    };

    return {
      accessToken: this.jwtService.sign(accessPayload),
      expireTime: moment().add(this.duration, 'seconds').toString(),
      refreshToken: this.jwtService.sign(refreshPayload),
      expireTimeRefreshToken: moment().add(this.refreshableDuration, 'seconds').toString(),
    };
  }
}
