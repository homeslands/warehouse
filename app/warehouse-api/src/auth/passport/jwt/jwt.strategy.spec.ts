import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { RbacService } from 'src/rbac/rbac.service';
import { AuthJwtPayload, TokenType } from '../../auth.dto';
import { TokenRevocationService } from '../../token-revocation.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const cachedScope = ['EXAMPLE_CREATE'];

  const rbacService = { resolve: jest.fn() };
  const cls = { set: jest.fn() };
  const tokenRevocationService = { isRevoked: jest.fn() };

  const payload: AuthJwtPayload = {
    sub: 'user-id',
    jti: 'jti-1',
    sid: 'sid-1',
    role: 'ADMIN',
    type: TokenType.Access,
    iat: 1000,
  };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    tokenRevocationService.isRevoked.mockResolvedValue(false);
    rbacService.resolve.mockResolvedValue(cachedScope);

    strategy = new JwtStrategy(
      rbacService as unknown as RbacService,
      cls as unknown as ClsService,
      tokenRevocationService as unknown as TokenRevocationService,
      { get: () => 'test-secret' } as unknown as ConfigService,
    );
  });

  // `scope` đến từ 1 lần `RbacService.resolve` (lần đọc Redis duy nhất cho RBAC trong request),
  // còn `roleName` đến từ claim `role` của token — cache không chứa role. Không query DB.
  it('builds the current user from the token claim and the RBAC cache', async () => {
    const result = await strategy.validate(payload);

    expect(tokenRevocationService.isRevoked).toHaveBeenCalledWith('user-id', 'sid-1', 1000);
    expect(rbacService.resolve).toHaveBeenCalledTimes(1);
    expect(rbacService.resolve).toHaveBeenCalledWith('user-id');
    expect(result).toEqual({
      userId: 'user-id',
      roleName: 'ADMIN',
      sessionId: 'sid-1',
      scope: ['EXAMPLE_CREATE'],
    });
    expect(cls.set).toHaveBeenCalledWith('user', result);
  });

  // Token phát trước khi có claim `role` vẫn phải dùng được tới lúc hết hạn — nhưng mất bypass
  // SUPER_ADMIN và `groups` rỗng, đúng như đánh đổi ghi trong `docs/specs/rbac.md`.
  it('leaves roleName undefined for a token issued before the role claim existed', async () => {
    const legacyPayload: AuthJwtPayload = { ...payload };
    delete legacyPayload.role;

    const result = await strategy.validate(legacyPayload);

    expect(result.roleName).toBeUndefined();
    expect(result.scope).toEqual(cachedScope);
  });

  // `[]` (role không có quyền nào, vd SUPER_ADMIN) là cache HIT hợp lệ, KHÁC `null` (user không
  // còn / bị khoá) — nhầm 2 cái này là mọi request của SUPER_ADMIN thành 401.
  it('accepts an empty scope as a valid resolve result', async () => {
    rbacService.resolve.mockResolvedValue([]);

    await expect(strategy.validate(payload)).resolves.toMatchObject({ scope: [] });
  });

  // Đây là điểm khác biệt lớn nhất so với thiết kế cũ: trước đây logout không chặn được access
  // token, giờ request kế tiếp phải 401 ngay — và không tốn thêm lần đọc cache/DB nào.
  it('rejects a token whose session was logged out, before resolving permissions', async () => {
    tokenRevocationService.isRevoked.mockResolvedValue(true);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rbacService.resolve).not.toHaveBeenCalled();
  });

  it('rejects a refresh token presented as an access token before any other check', async () => {
    await expect(strategy.validate({ ...payload, type: TokenType.Refresh })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokenRevocationService.isRevoked).not.toHaveBeenCalled();
    expect(rbacService.resolve).not.toHaveBeenCalled();
  });

  // `resolve` trả null khi user không còn tồn tại hoặc đã bị khoá (chỉ phát hiện được ở cache miss).
  it('rejects when the user cannot be resolved (missing or deactivated)', async () => {
    rbacService.resolve.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(cls.set).not.toHaveBeenCalled();
  });
});
