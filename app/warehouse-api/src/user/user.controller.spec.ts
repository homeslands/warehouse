import { Test, TestingModule } from '@nestjs/testing';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { CurrentUserDto } from './user.decorator';

describe('UserController', () => {
  let controller: UserController;
  const userService = {
    createUser: jest.fn(),
    findAll: jest.fn(),
    changeUserPassword: jest.fn(),
  };

  const currentUser: CurrentUserDto = {
    userId: 'user-id',
    roleName: 'ADMIN',
    sessionId: 'sid-1',
    scope: ['USER_CHANGE_PASSWORD'],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: userService }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('wraps change-user-password result in AppResponseDto', async () => {
    userService.changeUserPassword.mockResolvedValue({ userSlug: 'other-slug' });
    const requestData = { newPassword: 'new-password' };

    const response = await controller.changeUserPassword(currentUser, 'other-slug', requestData);

    expect(userService.changeUserPassword).toHaveBeenCalledWith(
      currentUser,
      'other-slug',
      requestData,
    );
    expect(response.result).toEqual({ userSlug: 'other-slug' });
    expect(response.statusCode).toBe(200);
  });

  // Quyền của luồng đổi hộ nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service
  // không check `scope` — gỡ decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào
  // khác phát hiện ra.
  it('guards the change-user-password route with USER_CHANGE_PASSWORD', () => {
    expect(Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, controller.changeUserPassword)).toBe(
      'USER_CHANGE_PASSWORD',
    );
  });
});
