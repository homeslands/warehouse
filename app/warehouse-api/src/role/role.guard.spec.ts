import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/auth/decorator/public.decorator';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from './role.enum';
import { AuthorityGuard } from './role.guard';

describe('AuthorityGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  let guard: AuthorityGuard;

  const context = (user?: Partial<CurrentUserDto>): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const metadata = (values: { isPublic?: boolean; requiredAuthority?: string }) => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return values.isPublic;
      if (key === REQUIRE_AUTHORITY_KEY) return values.requiredAuthority;
      return undefined;
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AuthorityGuard(reflector as unknown as Reflector);
  });

  it('lets a @Public() route through even without a user', () => {
    metadata({ isPublic: true });

    expect(guard.canActivate(context(undefined))).toBe(true);
  });

  it('lets any authenticated user through a route without @RequireAuthority', () => {
    metadata({});

    expect(guard.canActivate(context({ roleName: RoleEnum.Supervisor, scope: [] }))).toBe(true);
  });

  it('bypasses the check for SUPER_ADMIN regardless of scope', () => {
    metadata({ requiredAuthority: 'MANAGE_PERMISSIONS' });

    expect(guard.canActivate(context({ roleName: RoleEnum.SuperAdmin, scope: [] }))).toBe(true);
  });

  // `scope` là danh sách quyền `JwtStrategy` nạp từ cache Redis — guard chỉ so khớp, không tự đọc.
  it('allows when the cached scope contains the required authority', () => {
    metadata({ requiredAuthority: 'EXAMPLE_CREATE' });

    expect(
      guard.canActivate(context({ roleName: RoleEnum.Admin, scope: ['EXAMPLE_CREATE'] })),
    ).toBe(true);
  });

  it('denies when the cached scope lacks the required authority', () => {
    metadata({ requiredAuthority: 'EXAMPLE_DELETE' });

    expect(
      guard.canActivate(context({ roleName: RoleEnum.Admin, scope: ['EXAMPLE_CREATE'] })),
    ).toBe(false);
  });

  it('denies when scope is missing or there is no user at all', () => {
    metadata({ requiredAuthority: 'EXAMPLE_CREATE' });

    expect(guard.canActivate(context({ roleName: RoleEnum.Admin }))).toBe(false);
    expect(guard.canActivate(context(undefined))).toBe(false);
  });
});
