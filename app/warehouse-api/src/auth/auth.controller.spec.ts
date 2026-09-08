import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CurrentUserDto } from 'src/user/user.decorator';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    changeOwnPassword: jest.fn(),
  };

  const tokens = {
    accessToken: 'new-access-token',
    expireTime: 'Thu Sep 04 2026 10:15:00 GMT+0700',
    refreshToken: 'new-refresh-token',
    expireTimeRefreshToken: 'Sat Oct 04 2026 10:00:00 GMT+0700',
  };

  const currentUser: CurrentUserDto = {
    userId: 'user-id',
    userName: '0376295216',
    roleName: 'ADMIN',
    sessionId: 'sid-1',
    scope: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('wraps login result in AppResponseDto', async () => {
    authService.login.mockResolvedValue(tokens);

    const response = await controller.login({ phonenumber: '0376295216', password: 'password' });

    expect(authService.login).toHaveBeenCalledWith({
      phonenumber: '0376295216',
      password: 'password',
    });
    expect(response.result).toEqual(tokens);
    expect(response.statusCode).toBe(200);
  });

  it('wraps refresh result in AppResponseDto', async () => {
    authService.refresh.mockResolvedValue(tokens);

    const response = await controller.refresh({ refreshToken: 'old-refresh-token' });

    expect(authService.refresh).toHaveBeenCalledWith({ refreshToken: 'old-refresh-token' });
    expect(response.result).toEqual(tokens);
    expect(response.statusCode).toBe(200);
  });

  it('wraps logout result in AppResponseDto', async () => {
    authService.logout.mockResolvedValue({ revokedSessions: 1 });

    const response = await controller.logout(currentUser);

    expect(authService.logout).toHaveBeenCalledWith('user-id', 'sid-1');
    expect(response.result).toEqual({ revokedSessions: 1 });
    expect(response.statusCode).toBe(200);
  });

  it('wraps logout-all result in AppResponseDto', async () => {
    authService.logoutAll.mockResolvedValue({ revokedSessions: 1 });

    const response = await controller.logoutAll(currentUser);

    expect(authService.logoutAll).toHaveBeenCalledWith('user-id', 'sid-1');
    expect(response.result).toEqual({ revokedSessions: 1 });
  });

  it('wraps change-password result in AppResponseDto', async () => {
    authService.changeOwnPassword.mockResolvedValue({ tokens });
    const requestData = { currentPassword: 'old-password', newPassword: 'new-password' };

    const response = await controller.changePassword(currentUser, requestData);

    // Luồng tự đổi luôn chạy trên `currentUser` của token, không nhận slug từ client.
    expect(authService.changeOwnPassword).toHaveBeenCalledWith(currentUser, requestData);
    expect(response.result).toEqual({ tokens });
    expect(response.statusCode).toBe(200);
  });

  // Luồng tự đổi phải mở cho mọi user đã đăng nhập — gắn nhầm `@RequireAuthority` vào đây là khoá
  // mất đường đổi mật khẩu của user thường. Endpoint đổi hộ đã chuyển sang `UserController`.
  it('leaves the self change-password route open to every logged-in user', () => {
    expect(Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, controller.changePassword)).toBeUndefined();
  });
});
