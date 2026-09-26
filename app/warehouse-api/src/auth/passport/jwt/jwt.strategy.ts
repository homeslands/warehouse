import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ClsService } from 'nestjs-cls';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RbacService } from 'src/rbac/rbac.service';
import { AuthJwtPayload, TokenType } from '../../auth.dto';
import { TokenRevocationService } from '../../token-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly rbacService: RbacService,
    private readonly cls: ClsService,
    private readonly tokenRevocationService: TokenRevocationService,
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

    // Check thu hồi TRƯỚC khi đọc cache/DB: token đã bị logout/đổi mật khẩu thì không tốn thêm
    // round-trip nào. Fail-closed khi Redis lỗi (xem `TokenRevocationService.isRevoked`).
    if (await this.tokenRevocationService.isRevoked(payload.sub, payload.sid, payload.iat)) {
      throw new UnauthorizedException();
    }

    // Đây là lần đọc Redis duy nhất cho RBAC trong 1 request: 1 `SMEMBERS rbac:user:{userId}`
    // (ghi lúc login/refresh, TTL = DURATION). Hit ⇒ không query MySQL. Miss/Redis lỗi ⇒ fail-open:
    // `RbacService` đọc lại DB, tính lại quyền và ghi lại cache. `AuthorityGuard` phía sau chỉ so
    // `scope` đã nạp ở đây, không đọc Redis lần 2. Xem `docs/specs/rbac.md`.
    // `null` = user không còn / bị khoá (khác hẳn `[]` = có cache, role không có quyền nào).
    const scope = await this.resolveScope(payload.sub);
    if (!scope) {
      throw new UnauthorizedException();
    }

    const currentUser: CurrentUserDto = {
      userId: payload.sub,
      // Claim của access token, KHÔNG phải từ cache — cache chỉ còn chứa quyền.
      roleName: payload.role,
      sessionId: payload.sid,
      scope,
    };

    // nestjs-cls: lưu user theo request context, dùng ở các service không tiện truyền
    // @CurrentUser() qua tham số. Là `CurrentUserDto` (không phải entity) vì cache hit không load
    // entity từ DB.
    this.cls.set('user', currentUser);

    return currentUser;
  }

  /**
   * Redis lỗi đã được `RbacCacheService` nuốt (fail-open), nên lỗi tới được đây là lỗi MySQL ở
   * nhánh cache miss (mất kết nối, schema lệch vì chưa chạy migration...). Fail-closed với 503: không
   * tính được quyền thì không cho qua, nhưng cũng không để lỗi SQL thô lọt ra response dưới dạng 500.
   */
  private async resolveScope(userId: string): Promise<string[] | null> {
    try {
      return await this.rbacService.resolve(userId);
    } catch (error) {
      this.logger.error(
        `Cannot resolve RBAC scope for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException();
    }
  }
}
