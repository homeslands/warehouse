import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RoleEnum } from 'src/role/role.enum';

export interface CurrentUserDto {
  userId: string;
  userName: string;
  roleName: RoleEnum;
  scope: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserDto => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
