import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ClsService } from 'nestjs-cls';
import { CurrentUserDto } from 'src/user/user.decorator';
import { UserService } from 'src/user/user.service';
import { AuthUtils } from '../../auth.utils';
import { AuthJwtPayload, TokenType } from '../../auth.dto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly userService: UserService,
    private readonly cls: ClsService,
    private readonly authUtils: AuthUtils,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AuthJwtPayload): Promise<CurrentUserDto> {
    // Refresh token ký cùng JWT_SECRET nên chặn nó được dùng như access token; token phát hành
    // trước khi có claim `type` không có field này nên vẫn đi qua được tới lúc hết hạn.
    if (payload.type === TokenType.Refresh) {
      throw new UnauthorizedException();
    }

    const user = await this.userService.findByIdWithAuthorities(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    // nestjs-cls: lưu user/userSlug theo request context, dùng ở các service không tiện truyền
    // @CurrentUser() qua tham số (xem setup.md mục "Ghi chú hạ tầng khác").
    this.cls.set('user', user);
    this.cls.set('userSlug', user.slug);

    return {
      userId: user.id,
      userName: user.phonenumber,
      roleName: user.role?.name,
      // Tính lại từ dữ liệu vừa query (đã fetch role.permissions.authority mỗi request) thay vì
      // đọc từ JWT — quyền admin bật/tắt có hiệu lực ngay từ request tiếp theo, không cần re-login.
      scope: this.authUtils.buildScope(user),
    };
  }
}
