import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/auth/decorator/public.decorator';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { hasRole } from 'src/role/role.decorator';
import { WAREHOUSE_SCOPE_KEY } from '../decorator/warehouse-scope.decorator';
import { WarehouseService } from '../warehouse.service';
import { WarehouseException } from '../warehouse.exception';
import { WarehouseValidation } from '../warehouse.validation';

/**
 * Guard cho `@WarehouseScope`. Đăng ký global qua `APP_GUARD` (sau `AuthorityGuard`, xem
 * `app.module.ts`) thay vì `@UseGuards`: `@UseGuards` dựng guard trong module của controller, buộc
 * module nào dùng (vd. `warehouse-material`) cũng phải tự có `WarehouseService`.
 *
 * Khác `AuthorityGuard`, guard này đọc DB (1-2 query), nhưng chỉ khi endpoint có gắn decorator.
 * Qua được thì gắn kho vào `request.user.userWarehouse` — handler lấy qua `@CurrentUser()`, không
 * phải tra lại DB. `SUPER_ADMIN`/`ADMIN` bypass trước khi tra nên KHÔNG có `userWarehouse`.
 */
@Injectable()
export class WarehouseScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly warehouseService: WarehouseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const param = this.reflector.getAllAndOverride<string>(WAREHOUSE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!param) return true;

    const request = context.switchToHttp().getRequest();
    const user: CurrentUserDto | undefined = request.user;
    if (hasRole(user, RoleEnum.SuperAdmin, RoleEnum.Admin)) return true;
    if (!user?.userId) throw new WarehouseException(WarehouseValidation.WAREHOUSE_ACCESS_DENIED);

    // Param sai tên là lỗi lập trình (gắn decorator lên route không có `:param` đó) — ném lỗi thô
    // thành 500 để lộ ra ngay lúc dev, không âm thầm cho qua hay trả 403 khó hiểu.
    const warehouseSlug: string | undefined = request.params?.[param];
    if (!warehouseSlug)
      throw new Error(
        `@WarehouseScope: route param "${param}" not found on ${request.method} ${request.route?.path}`,
      );

    const userWarehouse = await this.warehouseService.findUserWarehouse(warehouseSlug, user.userId);
    if (userWarehouse === null)
      throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    if (!userWarehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_ACCESS_DENIED);

    user.userWarehouse = userWarehouse;
    return true;
  }
}
