import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
  };

  const tokens = {
    accessToken: 'new-access-token',
    expireTime: 'Thu Sep 04 2025 10:00:00 GMT+0700',
    refreshToken: 'new-refresh-token',
    expireTimeRefreshToken: 'Thu Sep 04 2025 20:00:00 GMT+0700',
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
});
