import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/user.entity';
import { AuthService } from './auth.service';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';
import { AuthJwtPayload, TokenType } from './auth.dto';
import { RefreshTokenService } from './refresh-token.service';

describe('AuthService', () => {
  let service: AuthService;

  const signedPayloads: AuthJwtPayload[] = [];
  const jwtService = {
    sign: jest.fn((payload: AuthJwtPayload) => {
      signedPayloads.push(payload);
      return `signed:${payload.type}`;
    }),
    verify: jest.fn(),
  };
  const userService = {
    findByPhoneNumber: jest.fn(),
    findByIdWithAuthorities: jest.fn(),
  };
  const refreshTokenService = {
    createSession: jest.fn(),
    rotate: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllForUser: jest.fn(),
    listActiveSessions: jest.fn(),
  };
  const config: Record<string, string> = { DURATION: '900', REFRESHABLE_DURATION: '2592000' };
  const configService = { get: (key: string) => config[key] };

  const activeUser = { id: 'user-id', isActive: true } as User;
  const session = { sessionId: 'sid-1', jti: '1757000000000-aaaaaaaa', ttlSeconds: 2592000 };

  const payloadOf = (type: TokenType) => signedPayloads.find((p) => p.type === type);

  const expectAuthError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toBeInstanceOf(AuthException);
    await expect(promise).rejects.toMatchObject({ code });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    signedPayloads.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: UserService, useValue: userService },
        { provide: RefreshTokenService, useValue: refreshTokenService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('creates a session and signs both tokens with the same sid', async () => {
      userService.findByPhoneNumber.mockResolvedValue({
        ...activeUser,
        password: 'hashed',
      } as User);
      jest.spyOn(service, 'validateUser').mockResolvedValue(activeUser);
      refreshTokenService.createSession.mockResolvedValue(session);

      const result = await service.login(
        { phonenumber: '0376295216', password: 'password' },
        { ipAddress: '1.2.3.4', userAgent: 'jest' },
      );

      expect(refreshTokenService.createSession).toHaveBeenCalledWith('user-id', {
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      });
      expect(result.accessToken).toBe(`signed:${TokenType.Access}`);
      expect(payloadOf(TokenType.Access).sid).toBe('sid-1');
      expect(payloadOf(TokenType.Refresh).sid).toBe('sid-1');
    });

    it('rejects invalid credentials', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);

      await expectAuthError(
        service.login({ phonenumber: '0376295216', password: 'wrong' }),
        AuthValidation.INVALID_CREDENTIALS.code,
      );
      expect(refreshTokenService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const validPayload = {
      sub: 'user-id',
      jti: 'old-jti',
      sid: 'sid-1',
      type: TokenType.Refresh,
    };

    it('rotates the session and issues a new token pair', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findByIdWithAuthorities.mockResolvedValue(activeUser);
      refreshTokenService.rotate.mockResolvedValue({ status: 'rotated', ...session });

      const result = await service.refresh({ refreshToken: 'valid' }, { ipAddress: '1.2.3.4' });

      expect(refreshTokenService.rotate).toHaveBeenCalledWith('user-id', 'old-jti', 'sid-1', {
        ipAddress: '1.2.3.4',
      });
      expect(result.refreshToken).toBe(`signed:${TokenType.Refresh}`);
      // refresh token mang đúng jti là khoá Redis; access token có jti riêng
      expect(payloadOf(TokenType.Refresh).jti).toBe(session.jti);
      expect(payloadOf(TokenType.Access).jti).not.toBe(session.jti);
      expect(payloadOf(TokenType.Access).sid).toBe('sid-1');
    });

    it('derives the refresh exp from the session ttl, not the configured duration', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findByIdWithAuthorities.mockResolvedValue(activeUser);
      refreshTokenService.rotate.mockResolvedValue({
        status: 'grace',
        sessionId: 'sid-1',
        jti: 'grace-jti',
        ttlSeconds: 42,
      });

      await service.refresh({ refreshToken: 'valid' });

      const now = Math.floor(Date.now() / 1000);
      expect(payloadOf(TokenType.Refresh).jti).toBe('grace-jti');
      expect(payloadOf(TokenType.Refresh).exp).toBeLessThanOrEqual(now + 42);
      expect(payloadOf(TokenType.Refresh).exp).toBeGreaterThan(now + 40);
    });

    it.each([
      ['reused', AuthValidation.REFRESH_TOKEN_REUSED.code],
      ['revoked', AuthValidation.REFRESH_TOKEN_REVOKED.code],
      ['session_expired', AuthValidation.SESSION_EXPIRED.code],
      ['not_found', AuthValidation.INVALID_REFRESH_TOKEN.code],
    ])('maps rotate outcome "%s" to the matching error code', async (status, code) => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findByIdWithAuthorities.mockResolvedValue(activeUser);
      refreshTokenService.rotate.mockResolvedValue({ status });

      await expectAuthError(service.refresh({ refreshToken: 'valid' }), code);
    });

    it('rejects an expired refresh token', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      jwtService.verify.mockImplementation(() => {
        throw expiredError;
      });

      await expectAuthError(
        service.refresh({ refreshToken: 'expired' }),
        AuthValidation.REFRESH_TOKEN_EXPIRED.code,
      );
      expect(refreshTokenService.rotate).not.toHaveBeenCalled();
    });

    it('rejects a malformed refresh token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expectAuthError(
        service.refresh({ refreshToken: 'garbage' }),
        AuthValidation.INVALID_REFRESH_TOKEN.code,
      );
    });

    it('rejects an access token sent as a refresh token', async () => {
      jwtService.verify.mockReturnValue({ ...validPayload, type: TokenType.Access });

      await expectAuthError(
        service.refresh({ refreshToken: 'access-token' }),
        AuthValidation.INVALID_REFRESH_TOKEN.code,
      );
      expect(userService.findByIdWithAuthorities).not.toHaveBeenCalled();
    });

    it('rejects when the user no longer exists', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findByIdWithAuthorities.mockResolvedValue(null);

      await expectAuthError(
        service.refresh({ refreshToken: 'valid' }),
        AuthValidation.INVALID_REFRESH_TOKEN.code,
      );
      expect(refreshTokenService.rotate).not.toHaveBeenCalled();
    });

    it('revokes every session and skips rotation when the user is deactivated', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findByIdWithAuthorities.mockResolvedValue({
        ...activeUser,
        isActive: false,
      } as User);

      await expectAuthError(
        service.refresh({ refreshToken: 'valid' }),
        AuthValidation.USER_NOT_ACTIVE.code,
      );
      expect(refreshTokenService.revokeAllForUser).toHaveBeenCalledWith('user-id');
      // không được ghi rotation cho user đã bị khoá
      expect(refreshTokenService.rotate).not.toHaveBeenCalled();
    });
  });

  describe('session management', () => {
    it('is a no-op when the access token predates the sid claim', async () => {
      expect(await service.logout('user-id', undefined)).toEqual({ revokedSessions: 0 });
      expect(refreshTokenService.revokeSession).not.toHaveBeenCalled();
    });

    it('revokes the current session on logout', async () => {
      refreshTokenService.revokeSession.mockResolvedValue(1);

      expect(await service.logout('user-id', 'sid-1')).toEqual({ revokedSessions: 1 });
      expect(refreshTokenService.revokeSession).toHaveBeenCalledWith('user-id', 'sid-1');
    });

    it('revokes every session on logout-all', async () => {
      refreshTokenService.revokeAllForUser.mockResolvedValue(3);

      expect(await service.logoutAll('user-id')).toEqual({ revokedSessions: 3 });
    });

    it('flags the current session and never leaks identifiers', async () => {
      refreshTokenService.listActiveSessions.mockResolvedValue([
        {
          sessionId: 'sid-1',
          currentJti: 'jti-1',
          createdAt: 'a',
          lastUsedAt: 'b',
          absoluteExpiresAt: 'c',
        },
        {
          sessionId: 'sid-2',
          currentJti: 'jti-2',
          createdAt: 'a',
          lastUsedAt: 'b',
          absoluteExpiresAt: 'c',
        },
      ]);

      const result = await service.listSessions('user-id', 'sid-1');

      expect(result[0].isCurrent).toBe(true);
      expect(result[1].isCurrent).toBe(false);
      expect(result[0]).not.toHaveProperty('sessionId');
      expect(result[0]).not.toHaveProperty('currentJti');
    });
  });
});
