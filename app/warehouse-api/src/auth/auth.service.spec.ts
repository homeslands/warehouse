import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/user.entity';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { AuthService } from './auth.service';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';
import { AuthJwtPayload, TokenType } from './auth.dto';
import { TokenRevocationService } from './token-revocation.service';
import { RbacService } from 'src/rbac/rbac.service';

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
    findById: jest.fn(),
    findBySlug: jest.fn(),
    updatePassword: jest.fn(),
  };
  const tokenRevocationService = {
    isRevoked: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllTokensForUser: jest.fn(),
  };
  const rbacService = { refresh: jest.fn() };
  const config: Record<string, string> = { DURATION: '900', REFRESHABLE_DURATION: '2592000' };
  const configService = { get: (key: string) => config[key] };

  const activeUser = { id: 'user-id', isActive: true } as User;
  const activeAdmin = { ...activeUser, role: { name: 'ADMIN' } } as User;

  const payloadOf = (type: TokenType) => signedPayloads.find((p) => p.type === type);

  const caller = (overrides: Partial<CurrentUserDto> = {}): CurrentUserDto => ({
    userId: 'user-id',
    roleName: RoleEnum.Manager,
    sessionId: 'sid-1',
    scope: [],
    ...overrides,
  });

  const expectAuthError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toBeInstanceOf(AuthException);
    await expect(promise).rejects.toMatchObject({ code });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    signedPayloads.length = 0;
    tokenRevocationService.isRevoked.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: UserService, useValue: userService },
        { provide: TokenRevocationService, useValue: tokenRevocationService },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('changeOwnPassword', () => {
    // Hash thật (cost 4 cho nhanh) thay vì mock bcrypt — luồng này sống chết bằng việc so mật khẩu
    // hiện tại có đúng không, mock đi thì test không còn chứng minh được gì.
    const currentPasswordHash = bcrypt.hashSync('old-password', 4);

    const self = {
      id: 'user-id',
      slug: 'my-slug',
      isActive: true,
      password: currentPasswordHash,
      role: { name: RoleEnum.Manager },
    } as unknown as User;

    it('rejects a wrong current password', async () => {
      userService.findById.mockResolvedValue(self);

      await expectAuthError(
        service.changeOwnPassword(caller(), {
          currentPassword: 'wrong-password',
          newPassword: 'new-password',
        }),
        AuthValidation.CURRENT_PASSWORD_INCORRECT.code,
      );
      expect(userService.updatePassword).not.toHaveBeenCalled();
    });

    it('revokes every session and issues a brand new one', async () => {
      userService.findById.mockResolvedValue(self);

      const result = await service.changeOwnPassword(caller(), {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      });

      expect(userService.updatePassword).toHaveBeenCalledWith('user-id', 'new-password');
      expect(tokenRevocationService.revokeAllTokensForUser).toHaveBeenCalledWith('user-id');
      // Khe hở 1 giây của cutoff: phiên đang gọi ký cùng giây sẽ lọt, phải chặn thêm theo `sid`.
      expect(tokenRevocationService.revokeSession).toHaveBeenCalledWith('user-id', 'sid-1');
      expect(result.tokens.accessToken).toBe(`signed:${TokenType.Access}`);
      // `sid` mới, nếu không thì cặp token vừa trả về dính luôn key blacklist vừa ghi ở trên.
      expect(payloadOf(TokenType.Access).sid).not.toBe('sid-1');
      expect(payloadOf(TokenType.Refresh).sid).toBe(payloadOf(TokenType.Access).sid);
    });

    // Cặp token này THAY THẾ token đang dùng — thiếu claim `role` là user tự đổi mật khẩu xong thì
    // mất bypass SUPER_ADMIN cho tới lần refresh kế tiếp.
    it('carries the role claim into the replacement token', async () => {
      userService.findById.mockResolvedValue(self);

      await service.changeOwnPassword(caller(), {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      });

      expect(payloadOf(TokenType.Access).role).toBe(RoleEnum.Manager);
    });

    // Endpoint tự đổi không bao giờ đọc tới user khác — chỉ tra đúng `userId` trong token.
    it('never looks the caller up by slug', async () => {
      userService.findById.mockResolvedValue(self);

      await service.changeOwnPassword(caller(), {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      });

      expect(userService.findBySlug).not.toHaveBeenCalled();
    });

    it('rejects a caller whose account no longer exists', async () => {
      userService.findById.mockResolvedValue(null);

      const promise = service.changeOwnPassword(caller(), {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      });

      await expect(promise).rejects.toBeInstanceOf(UserException);
      await expect(promise).rejects.toMatchObject({ code: UserValidation.USER_NOT_FOUND.code });
    });
  });

  describe('login', () => {
    // Deny-list: login không được ghi KEY THU HỒI nào. Lệnh ghi Redis duy nhất là cache RBAC
    // (`RbacService.refresh`), và phải ghi sau khi user đã được xác thực.
    it('signs both tokens with the same sid, writing only the RBAC cache', async () => {
      userService.findByPhoneNumber.mockResolvedValue({
        ...activeUser,
        password: 'hashed',
      } as User);
      jest.spyOn(service, 'validateUser').mockResolvedValue(activeUser);

      const result = await service.login({ phonenumber: '0376295216', password: 'password' });

      expect(result.accessToken).toBe(`signed:${TokenType.Access}`);
      expect(payloadOf(TokenType.Access).sid).toBeDefined();
      expect(payloadOf(TokenType.Refresh).sid).toBe(payloadOf(TokenType.Access).sid);
      expect(tokenRevocationService.revokeSession).not.toHaveBeenCalled();
      expect(tokenRevocationService.isRevoked).not.toHaveBeenCalled();
      expect(rbacService.refresh).toHaveBeenCalledWith(activeUser);
    });

    // `roleName` không còn nằm trong cache Redis nên nó phải đi theo access token — thiếu claim
    // này là `AuthorityGuard` mất bypass SUPER_ADMIN và interceptor mất `groups`.
    it('signs the role name into the access token only', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(activeAdmin);

      await service.login({ phonenumber: '0376295216', password: 'password' });

      expect(payloadOf(TokenType.Access).role).toBe('ADMIN');
      // Refresh token không cần role: `/auth/refresh` load user từ DB nên luôn có role mới nhất.
      expect(payloadOf(TokenType.Refresh).role).toBeUndefined();
    });

    it('rejects invalid credentials without touching the RBAC cache', async () => {
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);

      await expectAuthError(
        service.login({ phonenumber: '0376295216', password: 'wrong' }),
        AuthValidation.INVALID_CREDENTIALS.code,
      );
      expect(rbacService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const validPayload = {
      sub: 'user-id',
      jti: 'old-jti',
      sid: 'sid-1',
      type: TokenType.Refresh,
    };

    // Role đọc lại từ DB mỗi lần refresh ⇒ đổi role có hiệu lực chậm nhất sau 1 `DURATION`, dù
    // claim trong token cũ không thu hồi được.
    it('re-signs the role claim from the database', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findById.mockResolvedValue(activeAdmin);

      await service.refresh({ refreshToken: 'valid' });

      expect(payloadOf(TokenType.Access).role).toBe('ADMIN');
    });

    it('reissues both tokens with the same sid and a full refresh lifetime', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findById.mockResolvedValue(activeUser);

      const result = await service.refresh({ refreshToken: 'valid' });
      const now = Math.floor(Date.now() / 1000);

      expect(tokenRevocationService.isRevoked).toHaveBeenCalledWith('user-id', 'sid-1', undefined);
      expect(result.refreshToken).toBe(`signed:${TokenType.Refresh}`);
      // `sid` phải giữ nguyên, nếu không thì logout bằng sid cũ không giết được token mới.
      expect(payloadOf(TokenType.Refresh).sid).toBe('sid-1');
      expect(payloadOf(TokenType.Access).sid).toBe('sid-1');
      // Bỏ rotation: hạn refresh luôn là REFRESHABLE_DURATION đầy đủ, không kế thừa hạn cũ.
      expect(payloadOf(TokenType.Refresh).exp).toBeGreaterThan(now + 2592000 - 5);
      // Access token mới có hạn mới ⇒ cache RBAC (TTL = DURATION từ lúc login) phải được ghi lại.
      expect(rbacService.refresh).toHaveBeenCalledWith(activeUser);
    });

    it('rejects a revoked refresh token before hitting the database', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      tokenRevocationService.isRevoked.mockResolvedValue(true);

      await expectAuthError(
        service.refresh({ refreshToken: 'valid' }),
        AuthValidation.REFRESH_TOKEN_REVOKED.code,
      );
      expect(userService.findById).not.toHaveBeenCalled();
    });

    // Không có `sid` thì token phát ra sẽ không bao giờ logout được — từ chối ngay.
    it('rejects a refresh token carrying no sid', async () => {
      jwtService.verify.mockReturnValue({ ...validPayload, sid: undefined });

      await expectAuthError(
        service.refresh({ refreshToken: 'valid' }),
        AuthValidation.INVALID_REFRESH_TOKEN.code,
      );
      expect(tokenRevocationService.isRevoked).not.toHaveBeenCalled();
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
      expect(tokenRevocationService.isRevoked).not.toHaveBeenCalled();
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
      expect(userService.findById).not.toHaveBeenCalled();
    });

    it('rejects when the user no longer exists', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findById.mockResolvedValue(null);

      await expectAuthError(
        service.refresh({ refreshToken: 'valid' }),
        AuthValidation.INVALID_REFRESH_TOKEN.code,
      );
    });

    it('revokes every token and issues nothing when the user is deactivated', async () => {
      jwtService.verify.mockReturnValue(validPayload);
      userService.findById.mockResolvedValue({
        ...activeUser,
        isActive: false,
      } as User);

      await expectAuthError(
        service.refresh({ refreshToken: 'valid' }),
        AuthValidation.USER_NOT_ACTIVE.code,
      );
      expect(tokenRevocationService.revokeAllTokensForUser).toHaveBeenCalledWith('user-id');
      expect(signedPayloads).toHaveLength(0);
      expect(rbacService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    // `userName` cố tình không nằm trong cache RBAC (xem docs/specs/rbac.md) nên endpoint này là
    // chỗ duy nhất phải đọc DB để lấy `phonenumber`.
    it('merges the phonenumber from the database into the current user', async () => {
      userService.findById.mockResolvedValue({ ...activeUser, phonenumber: '0376295216' } as User);

      expect(await service.getProfile(caller())).toEqual({
        userId: 'user-id',
        userName: '0376295216',
        roleName: RoleEnum.Manager,
        sessionId: 'sid-1',
        scope: [],
      });
      expect(userService.findById).toHaveBeenCalledWith('user-id');
    });

    // Cache hit không load entity, nên token vẫn hợp lệ sau khi user bị xoá khỏi DB.
    it('rejects when the user no longer exists', async () => {
      userService.findById.mockResolvedValue(null);

      await expect(service.getProfile(caller())).rejects.toBeInstanceOf(UserException);
    });
  });

  describe('logout', () => {
    it('is a no-op when the access token predates the sid claim', async () => {
      expect(await service.logout('user-id', undefined)).toEqual({ revokedSessions: 0 });
      expect(tokenRevocationService.revokeSession).not.toHaveBeenCalled();
    });

    it('blacklists the current session on logout', async () => {
      expect(await service.logout('user-id', 'sid-1')).toEqual({ revokedSessions: 1 });
      expect(tokenRevocationService.revokeSession).toHaveBeenCalledWith('user-id', 'sid-1');
    });

    it('writes the account-wide cutoff on logout-all', async () => {
      expect(await service.logoutAll('user-id')).toEqual({ revokedSessions: 1 });
      expect(tokenRevocationService.revokeAllTokensForUser).toHaveBeenCalledWith('user-id');
    });

    // Khe hở 1 giây của cutoff: token ký cùng giây với logout-all sẽ lọt, và đó chính là token
    // của người vừa bấm nút. Chặn thêm theo `sid` để nó chết chắc chắn.
    it('also blacklists the caller own session on logout-all', async () => {
      await service.logoutAll('user-id', 'sid-1');

      expect(tokenRevocationService.revokeSession).toHaveBeenCalledWith('user-id', 'sid-1');
    });
  });
});
