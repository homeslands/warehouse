import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Kho của route hiện tại mà user thuộc về — do `WarehouseScopeGuard` gắn vào `CurrentUserDto`. */
export interface CurrentUserWarehouseDto {
  /** uuid PK — chỉ dùng nội bộ (join, FK), không trả ra response. */
  id: string;
  slug: string;
  code: string;
  name: string;
  /** `true` = manager của kho (`warehouse_tbl.manager_id_column`), `false` = member thường. */
  isManager: boolean;
}

export interface CurrentUserDto {
  userId: string;
  /** Claim `role` của access token. `undefined` với token phát trước khi có claim này. */
  roleName?: string;
  /** Phiên đăng nhập hiện tại (claim `sid`). Vắng mặt với token phát trước khi có claim này. */
  sessionId?: string;
  scope: string[];
  /**
   * Chỉ có trên endpoint gắn `@WarehouseScope` và user là manager/member của kho ở route param.
   * `undefined` với `SUPER_ADMIN`/`ADMIN` (bypass guard, không tra DB) và mọi endpoint khác.
   */
  userWarehouse?: CurrentUserWarehouseDto;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserDto => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
