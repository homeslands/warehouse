import { Test, TestingModule } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
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
    scope: [],
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

  // Quyền của cả controller nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service
  // không check role của người gọi — gỡ decorator là mở endpoint cho mọi user đã đăng nhập mà không
  // test nào khác phát hiện ra.
  it('maps every route to its authority code', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);
    expect(authority(controller.createUser)).toEqual([AuthorityCode.UserCreate]);
    expect(authority(controller.findAll)).toEqual([AuthorityCode.UserRead]);
    expect(authority(controller.changeUserPassword)).toEqual([AuthorityCode.UserChangePassword]);
    expect(authority(controller.updateUser)).toEqual([AuthorityCode.UserUpdate]);
    expect(authority(controller.lockUser)).toEqual([AuthorityCode.UserUpdate]);
    expect(authority(controller.changeUserRole)).toEqual([AuthorityCode.UserUpdate]);
  });

  // `DELETE /users/{slug}` là KHOÁ (isActive = false), không phải xoá bản ghi.
  it('maps lockUser to DELETE /users/:userSlug', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, controller.lockUser)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(PATH_METADATA, controller.lockUser)).toBe(':userSlug');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.updateUser)).toBe(RequestMethod.PATCH);
  });
});
