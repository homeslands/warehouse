import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/auth/decorator/public.decorator';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { WAREHOUSE_SCOPE_KEY } from './warehouse-scope.decorator';
import { WarehouseScopeGuard } from './warehouse-scope.guard';
import { WarehouseService } from './warehouse.service';
import { WarehouseException } from './warehouse.exception';
import { WarehouseValidation } from './warehouse.validation';

describe('WarehouseScopeGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const warehouseService = { isManagerOrMember: jest.fn() };
  let guard: WarehouseScopeGuard;

  const context = (
    user?: Partial<CurrentUserDto>,
    params: Record<string, string> = { slug: 'wh-slug-1' },
  ): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user, params, method: 'GET', route: { path: '/warehouses/:x' } }),
      }),
    }) as unknown as ExecutionContext;

  const metadata = (values: { isPublic?: boolean; param?: string }) => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return values.isPublic;
      if (key === WAREHOUSE_SCOPE_KEY) return values.param;
      return undefined;
    });
  };

  const member = { userId: 'user-id-1', roleName: RoleEnum.Supervisor };

  const expectWarehouseError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toBeInstanceOf(WarehouseException);
    await expect(promise).rejects.toMatchObject({ code });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new WarehouseScopeGuard(
      reflector as unknown as Reflector,
      warehouseService as unknown as WarehouseService,
    );
  });

  it('lets a @Public() route through', async () => {
    metadata({ isPublic: true, param: 'slug' });

    await expect(guard.canActivate(context(undefined))).resolves.toBe(true);
    expect(warehouseService.isManagerOrMember).not.toHaveBeenCalled();
  });

  it('lets a route without @WarehouseScope through without touching the DB', async () => {
    metadata({});

    await expect(guard.canActivate(context(member))).resolves.toBe(true);
    expect(warehouseService.isManagerOrMember).not.toHaveBeenCalled();
  });

  it.each([RoleEnum.SuperAdmin, RoleEnum.Admin])('bypasses %s', async (roleName) => {
    metadata({ param: 'slug' });

    await expect(guard.canActivate(context({ userId: 'admin-id', roleName }))).resolves.toBe(true);
    expect(warehouseService.isManagerOrMember).not.toHaveBeenCalled();
  });

  it('lets a manager or member of the warehouse in the route param through', async () => {
    metadata({ param: 'warehouseSlug' });
    warehouseService.isManagerOrMember.mockResolvedValue(true);

    await expect(guard.canActivate(context(member, { warehouseSlug: 'wh-slug-2' }))).resolves.toBe(
      true,
    );
    expect(warehouseService.isManagerOrMember).toHaveBeenCalledWith('wh-slug-2', 'user-id-1');
  });

  it('rejects a user who is neither manager nor member', async () => {
    metadata({ param: 'slug' });
    warehouseService.isManagerOrMember.mockResolvedValue(false);

    await expectWarehouseError(
      guard.canActivate(context(member)),
      WarehouseValidation.WAREHOUSE_ACCESS_DENIED.code,
    );
  });

  it('returns not found when the warehouse does not exist', async () => {
    metadata({ param: 'slug' });
    warehouseService.isManagerOrMember.mockResolvedValue(null);

    await expectWarehouseError(
      guard.canActivate(context(member)),
      WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
    );
  });

  it('rejects a request without an authenticated user', async () => {
    metadata({ param: 'slug' });

    await expectWarehouseError(
      guard.canActivate(context(undefined)),
      WarehouseValidation.WAREHOUSE_ACCESS_DENIED.code,
    );
    expect(warehouseService.isManagerOrMember).not.toHaveBeenCalled();
  });

  it('fails loudly when the decorator names a param the route does not have', async () => {
    metadata({ param: 'warehouseSlug' });

    await expect(guard.canActivate(context(member, { slug: 'wh-slug-1' }))).rejects.toThrow(
      '@WarehouseScope: route param "warehouseSlug" not found',
    );
  });
});
