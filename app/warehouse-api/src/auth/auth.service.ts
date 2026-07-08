import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { User } from 'src/user/user.entity';
import { Role } from 'src/role/role.entity';
import { RoleEnum } from 'src/role/role.enum';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import {
  AuthJwtPayload,
  LoginAuthRequestDto,
  LoginAuthResponseDto,
  RegisterAuthRequestDto,
} from './auth.dto';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';
import { AuthUtils, checkActiveUser } from './auth.utils';

@Injectable()
export class AuthService {
  private readonly saltRounds: number;
  private readonly duration: number;
  private readonly refeshableDuration: number;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authUtils: AuthUtils,
  ) {
    this.saltRounds = parseInt(this.configService.get('SALT_ROUNDS'), 10);
    this.duration = parseInt(this.configService.get('DURATION'), 10);
    this.refeshableDuration = parseInt(this.configService.get('REFRESHABLE_DURATION'), 10);
  }

  async validateUser(phonenumber: string, pass: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { phonenumber },
      relations: { role: { permissions: { authority: { authorityGroup: true } } } },
    });
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
      scope: this.authUtils.buildScope(user),
    };
    return this.generateToken(payload);
  }

  async register(registerAuthDto: RegisterAuthRequestDto): Promise<User> {
    const existed = await this.userRepository.findOneBy({
      phonenumber: registerAuthDto.phonenumber,
    });
    if (existed) throw new AuthException(AuthValidation.PHONENUMBER_DOES_EXIST);

    const customerRole = await this.roleRepository.findOneBy({ name: RoleEnum.Customer });
    if (!customerRole) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);

    const hashedPassword = await bcrypt.hash(registerAuthDto.password, this.saltRounds);
    const user = this.userRepository.create({
      phonenumber: registerAuthDto.phonenumber,
      password: hashedPassword,
      role: customerRole,
    });
    return this.userRepository.save(user);
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
