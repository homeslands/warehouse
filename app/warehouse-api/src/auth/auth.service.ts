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
  RefreshAuthRequestDto,
  TokenType,
} from './auth.dto';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';
import { checkActiveUser } from './auth.utils';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
  private readonly duration: number;
  private readonly refeshableDuration: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    this.duration = parseInt(this.configService.get('DURATION'), 10);
    this.refeshableDuration = parseInt(this.configService.get('REFRESHABLE_DURATION'), 10);
  }

  async validateUser(phonenumber: string, pass: string): Promise<User | null> {
    const user = await this.userService.findByPhoneNumber(phonenumber);
    if (!user) return null;
    if (user.phonenumber === 'default-customer') return null;

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) return null;
    return user;
  }

  async login(loginAuthDto: LoginAuthRequestDto): Promise<LoginAuthResponseDto> {
    const user = await this.validateUser(loginAuthDto.phonenumber, loginAuthDto.password);
    if (!user) throw new AuthException(AuthValidation.INVALID_CREDENTIALS);

    checkActiveUser(user);

    const payload: AuthJwtPayload = {
      sub: user.id,
      jti: uuidv4(),
    };
    return this.generateToken(payload);
  }

  /**
   * Đổi refresh token còn hạn lấy cặp access/refresh token mới (token rotation — refresh token cũ
   * không bị vô hiệu hoá vì chưa có token store, nhưng mỗi lần refresh sinh `jti` mới).
   * Stateless: chỉ verify chữ ký + hạn của refresh token rồi kiểm tra lại user trong DB.
   */
  async refresh(refreshAuthDto: RefreshAuthRequestDto): Promise<LoginAuthResponseDto> {
    const payload = this.verifyRefreshToken(refreshAuthDto.refreshToken);

    const user = await this.userService.findByIdWithAuthorities(payload.sub);
    if (!user) throw new AuthException(AuthValidation.INVALID_REFRESH_TOKEN);

    checkActiveUser(user);

    return this.generateToken({
      sub: user.id,
      jti: uuidv4(),
    });
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

  async generateToken(payload: AuthJwtPayload): Promise<LoginAuthResponseDto> {
    const refreshPayload: AuthJwtPayload = {
      sub: payload.sub,
      jti: payload.jti,
      type: TokenType.Refresh,
      exp: Math.floor(Date.now() / 1000) + this.refeshableDuration,
    };

    return {
      accessToken: this.jwtService.sign({
        ...payload,
        type: TokenType.Access,
        exp: Math.floor(Date.now() / 1000) + this.duration,
      }),
      expireTime: moment().add(this.duration, 'seconds').toString(),
      refreshToken: this.jwtService.sign(refreshPayload),
      expireTimeRefreshToken: moment().add(this.refeshableDuration, 'seconds').toString(),
    };
  }
}
