import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../decorator/public.decorator';

@Injectable()
export class JwtOptionalAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // Guard là singleton dùng chung cho mọi request, nên trạng thái "route này có @Public() không"
  // KHÔNG được giữ trên instance: `canActivate` await passport rồi mới tới `handleRequest`, hai
  // request đan xen sẽ đọc trúng cờ của nhau — chiều nguy hiểm là request vào route cần JWT đọc
  // trúng cờ public của request khác và đi lọt mà không có token. Đọc lại metadata từ chính
  // `context` của request này thay vì nhớ trong field.
  handleRequest<TUser = any>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return (user ?? {}) as TUser;
    }
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    return user;
  }
}
