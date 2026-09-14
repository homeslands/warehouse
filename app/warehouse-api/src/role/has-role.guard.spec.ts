import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/auth/decorator/public.decorator';
import { CurrentUserDto } from 'src/user/user.decorator';
import { HAS_ROLE_KEY, hasRole } from './role.decorator';
import { RoleEnum } from './role.enum';
import { HasRoleGuard } from './role.guard';

describe('HasRoleGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  let guard: HasRoleGuard;

  const context = (user?: Partial<CurrentUserDto>): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const metadata = (values: { isPublic?: boolean; allowedRoles?: RoleEnum[] }) => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return values.isPublic;
      if (key === HAS_ROLE_KEY) return values.allowedRoles;
      return undefined;
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new HasRoleGuard(reflector as unknown as Reflector);
  });

  it('lets a @Public() route through even without a user', () => {
    metadata({ isPublic: true, allowedRoles: [RoleEnum.Admin] });

    expect(guard.canActivate(context(undefined))).toBe(true);
  });

  it('lets any authenticated user through a route without @HasRole', () => {
    metadata({});

    expect(guard.canActivate(context({ roleName: RoleEnum.Supervisor, scope: [] }))).toBe(true);
  });

  it('bypasses the check for SUPER_ADMIN', () => {
    metadata({ allowedRoles: [RoleEnum.Admin] });

    expect(guard.canActivate(context({ roleName: RoleEnum.SuperAdmin, scope: [] }))).toBe(true);
  });

  it('allows a role listed in the decorator', () => {
    metadata({ allowedRoles: [RoleEnum.Admin, RoleEnum.Manager] });

    expect(guard.canActivate(context({ roleName: RoleEnum.Manager, scope: [] }))).toBe(true);
  });

  it('denies a role that is not listed, even with a matching scope', () => {
    metadata({ allowedRoles: [RoleEnum.Admin] });

    expect(
      guard.canActivate(context({ roleName: RoleEnum.Supervisor, scope: ['EXAMPLE_CREATE'] })),
    ).toBe(false);
  });

  // Fail-closed: token phát trước khi có claim `role`, hoặc route lọt vào guard mà không có user.
  it('denies when roleName is missing or there is no user at all', () => {
    metadata({ allowedRoles: [RoleEnum.Admin] });

    expect(guard.canActivate(context({ scope: [] }))).toBe(false);
    expect(guard.canActivate(context(undefined))).toBe(false);
  });
});

describe('hasRole()', () => {
  it('matches the user roleName against the given roles', () => {
    const admin = { userId: 'u1', roleName: RoleEnum.Admin, scope: [] };

    expect(hasRole(admin, RoleEnum.Admin)).toBe(true);
    expect(hasRole(admin, RoleEnum.SuperAdmin, RoleEnum.Admin)).toBe(true);
    expect(hasRole(admin, RoleEnum.SuperAdmin)).toBe(false);
  });

  it('is false for an undefined user or a token without the role claim', () => {
    expect(hasRole(undefined, RoleEnum.Admin)).toBe(false);
    expect(hasRole({ userId: 'u1', scope: [] }, RoleEnum.Admin)).toBe(false);
  });
});
