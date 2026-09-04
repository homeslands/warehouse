import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserDto {
  userId: string;
  userName: string;
  roleName: string;
  /** Phiên đăng nhập hiện tại (claim `sid`). Vắng mặt với token phát trước khi có claim này. */
  sessionId?: string;
  scope: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserDto => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
