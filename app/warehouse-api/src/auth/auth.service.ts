import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { User } from 'src/user/user.entity';
import { AuthJwtPayload, LoginAuthRequestDto, LoginAuthResponseDto } from './auth.dto';
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

  async generateToken(payload: AuthJwtPayload): Promise<LoginAuthResponseDto> {
    const refreshPayload: AuthJwtPayload = {
      sub: payload.sub,
      jti: payload.jti,
      exp: Math.floor(Date.now() / 1000) + this.refeshableDuration,
    };

    return {
      accessToken: this.jwtService.sign({
        ...payload,
        exp: Math.floor(Date.now() / 1000) + this.duration,
      }),
      expireTime: moment().add(this.duration, 'seconds').toString(),
      refreshToken: this.jwtService.sign(refreshPayload),
      expireTimeRefreshToken: moment().add(this.refeshableDuration, 'seconds').toString(),
    };
  }
}
