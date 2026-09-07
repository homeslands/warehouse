import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CurrentUserDto } from 'src/user/user.decorator';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
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
});
