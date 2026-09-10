import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/auth/decorator/public.decorator';
import { CurrentUserDto } from 'src/user/user.decorator';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { RoleEnum } from './role.enum';

/**
 * Guard KHÔNG tự đọc Redis/DB: `user.scope` đã được `JwtStrategy` nạp từ cache RBAC
 * (SET `rbac:user:{userId}`, fallback DB khi miss) ngay trước guard này — đúng 1 lần đọc
 * Redis cho RBAC mỗi request. Xem `docs/specs/rbac.md`.
 */
@Injectable()
export class AuthorityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredAuthority = this.reflector.getAllAndOverride<string>(REQUIRE_AUTHORITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredAuthority) return true;

    const user: CurrentUserDto = context.switchToHttp().getRequest().user;
    if (user?.roleName === RoleEnum.SuperAdmin) return true;

    return (user?.scope ?? []).includes(requiredAuthority);
  }
}
