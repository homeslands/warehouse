import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/user.entity';
import { AuthService } from './auth.service';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';
import { TokenType } from './auth.dto';

describe('AuthService', () => {
  let service: AuthService;

  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };
  const userService = {
    findByPhoneNumber: jest.fn(),
    findByIdWithAuthorities: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => (key === 'DURATION' ? '3600' : '36000')),
  };

  const activeUser = { id: 'user-id', isActive: true } as User;

  const expectAuthError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toBeInstanceOf(AuthException);
    await expect(promise).rejects.toMatchObject({ code });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtService.sign.mockImplementation((payload: { type: TokenType }) => `signed:${payload.type}`);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: UserService, useValue: userService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('refresh', () => {
    it('issues a new token pair for a valid refresh token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        jti: 'old-jti',
        type: TokenType.Refresh,
      });
      userService.findByIdWithAuthorities.mockResolvedValue(activeUser);

      const result = await service.refresh({ refreshToken: 'valid-refresh-token' });

      expect(jwtService.verify).toHaveBeenCalledWith('valid-refresh-token');
      expect(userService.findByIdWithAuthorities).toHaveBeenCalledWith('user-id');
      expect(result.accessToken).toBe(`signed:${TokenType.Access}`);
      expect(result.refreshToken).toBe(`signed:${TokenType.Refresh}`);
      // jti được xoay vòng, không tái sử dụng jti của refresh token cũ
      const [[refreshPayload]] = jwtService.sign.mock.calls.filter(
        ([payload]: [{ type: TokenType }]) => payload.type === TokenType.Refresh,
      );
      expect(refreshPayload.jti).not.toBe('old-jti');
    });

    it('rejects an expired refresh token', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      jwtService.verify.mockImplementation(() => {
        throw expiredError;
      });

      await expectAuthError(
        service.refresh({ refreshToken: 'expired-token' }),
        AuthValidation.REFRESH_TOKEN_EXPIRED.code,
      );
      expect(userService.findByIdWithAuthorities).not.toHaveBeenCalled();
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

    it('rejects an access token sent as refresh token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        jti: 'jti',
        type: TokenType.Access,
      });

      await expectAuthError(
        service.refresh({ refreshToken: 'access-token' }),
        AuthValidation.INVALID_REFRESH_TOKEN.code,
      );
      expect(userService.findByIdWithAuthorities).not.toHaveBeenCalled();
    });

    it('rejects when the user no longer exists', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        jti: 'jti',
        type: TokenType.Refresh,
      });
      userService.findByIdWithAuthorities.mockResolvedValue(null);

      await expectAuthError(
        service.refresh({ refreshToken: 'valid-refresh-token' }),
        AuthValidation.INVALID_REFRESH_TOKEN.code,
      );
    });

    it('rejects when the user has been deactivated', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-id',
        jti: 'jti',
        type: TokenType.Refresh,
      });
      userService.findByIdWithAuthorities.mockResolvedValue({
        ...activeUser,
        isActive: false,
      } as User);

      await expectAuthError(
        service.refresh({ refreshToken: 'valid-refresh-token' }),
        AuthValidation.USER_NOT_ACTIVE.code,
      );
    });
  });
});
