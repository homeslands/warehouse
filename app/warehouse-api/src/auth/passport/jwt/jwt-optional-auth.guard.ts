import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../decorator/public.decorator';

@Injectable()
export class JwtOptionalAuthGuard extends AuthGuard('jwt') {
  private isPublic = false;

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    this.isPublic = !!isPublic;
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: unknown, user: TUser): TUser {
    if (this.isPublic) {
      return (user ?? {}) as TUser;
    }
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    return user;
  }
}
