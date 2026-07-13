import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserDto {
  userId: string;
  userName: string;
  roleName: string;
  scope: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserDto => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
