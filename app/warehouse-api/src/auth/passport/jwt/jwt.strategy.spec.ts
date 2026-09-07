import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/user.entity';
import { AuthUtils } from '../../auth.utils';
import { AuthJwtPayload, TokenType } from '../../auth.dto';
import { TokenRevocationService } from '../../token-revocation.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const activeUser = {
    id: 'user-id',
    slug: 'user-slug',
    phonenumber: '0376295216',
    isActive: true,
    role: { name: 'ADMIN' },
  } as User;

  const userService = { findByIdWithAuthorities: jest.fn() };
  const cls = { set: jest.fn() };
  const authUtils = { buildScope: jest.fn(() => ['EXAMPLE_CREATE']) };
  const tokenRevocationService = { isRevoked: jest.fn() };

  const payload: AuthJwtPayload = {
    sub: 'user-id',
    jti: 'jti-1',
    sid: 'sid-1',
    type: TokenType.Access,
    iat: 1000,
  };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    tokenRevocationService.isRevoked.mockResolvedValue(false);
    userService.findByIdWithAuthorities.mockResolvedValue(activeUser);

    strategy = new JwtStrategy(
      userService as unknown as UserService,
      cls as unknown as ClsService,
      authUtils as unknown as AuthUtils,
      tokenRevocationService as unknown as TokenRevocationService,
      { get: () => 'test-secret' } as unknown as ConfigService,
    );
  });

  it('returns the current user when the token is live', async () => {
    const result = await strategy.validate(payload);

    expect(tokenRevocationService.isRevoked).toHaveBeenCalledWith('user-id', 'sid-1', 1000);
    expect(result).toMatchObject({
      userId: 'user-id',
      roleName: 'ADMIN',
      sessionId: 'sid-1',
      scope: ['EXAMPLE_CREATE'],
    });
  });

  // Đây là điểm khác biệt lớn nhất so với thiết kế cũ: trước đây logout không chặn được access
  // token, giờ request kế tiếp phải 401 ngay.
  it('rejects a token whose session was logged out, without querying the database', async () => {
    tokenRevocationService.isRevoked.mockResolvedValue(true);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userService.findByIdWithAuthorities).not.toHaveBeenCalled();
  });

  it('rejects a refresh token presented as an access token before any other check', async () => {
    await expect(strategy.validate({ ...payload, type: TokenType.Refresh })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokenRevocationService.isRevoked).not.toHaveBeenCalled();
  });

  it('rejects when the user no longer exists', async () => {
    userService.findByIdWithAuthorities.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a deactivated user', async () => {
    userService.findByIdWithAuthorities.mockResolvedValue({
      ...activeUser,
      isActive: false,
    } as User);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
