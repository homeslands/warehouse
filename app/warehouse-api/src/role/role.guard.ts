import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/auth/decorator/public.decorator';
import { CurrentUserDto } from 'src/user/user.decorator';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { HAS_ROLE_KEY } from './role.decorator';
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

    const requiredAuthorities = this.reflector.getAllAndOverride<string[]>(REQUIRE_AUTHORITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredAuthorities?.length) return true;

    const user: CurrentUserDto = context.switchToHttp().getRequest().user;
    if (user?.roleName === RoleEnum.SuperAdmin) return true;

    // AND: `@RequireAuthority(A, B)` cần đủ cả A lẫn B.
    const scope = user?.scope ?? [];
    return requiredAuthorities.every((code) => scope.includes(code));
  }
}

/**
 * RBAC cơ bản (`@HasRole(RoleEnum.Admin, ...)`) — chạy song song, độc lập với `AuthorityGuard`:
 * endpoint gắn cả 2 decorator phải qua cả 2 guard (AND). Không đọc DB/Redis, chỉ so `roleName`
 * (claim `role` của access token) với danh sách role khai trong decorator.
 */
@Injectable()
export class HasRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowedRoles = this.reflector.getAllAndOverride<RoleEnum[]>(HAS_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowedRoles?.length) return true;

    const user: CurrentUserDto = context.switchToHttp().getRequest().user;
    if (user?.roleName === RoleEnum.SuperAdmin) return true;

    // Token phát trước khi có claim `role` (`roleName` undefined) bị chặn — fail-closed.
    return !!user?.roleName && allowedRoles.includes(user.roleName as RoleEnum);
  }
}
