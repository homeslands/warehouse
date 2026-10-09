import { Test, TestingModule } from '@nestjs/testing';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { CurrentUserDto } from './user.decorator';
import { GetAllUserRequestDto } from './user.dto';

describe('UserController', () => {
  let controller: UserController;
  const userService = {
    createUser: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    changeUserPassword: jest.fn(),
    deleteUser: jest.fn(),
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
    expect(authority(controller.findOne)).toEqual([AuthorityCode.UserRead]);
    expect(authority(controller.changeUserPassword)).toEqual([AuthorityCode.UserChangePassword]);
    expect(authority(controller.updateUser)).toEqual([AuthorityCode.UserUpdate]);
    expect(authority(controller.lockUser)).toEqual([AuthorityCode.UserUpdate]);
    expect(authority(controller.unlockUser)).toEqual([AuthorityCode.UserUpdate]);
    expect(authority(controller.deleteUser)).toEqual([AuthorityCode.UserDelete]);
    expect(authority(controller.changeUserRole)).toEqual([AuthorityCode.UserUpdate]);
  });

  // Khoá/mở khoá là `PUT .../lock|unlock`; `DELETE /users/{slug}` là xoá (mềm) user.
  it.each([
    ['lockUser', RequestMethod.PUT, ':userSlug/lock'],
    ['unlockUser', RequestMethod.PUT, ':userSlug/unlock'],
    ['deleteUser', RequestMethod.DELETE, ':userSlug'],
    ['updateUser', RequestMethod.PATCH, ':userSlug'],
    ['findOne', RequestMethod.GET, ':userSlug'],
  ] as const)('maps %s to %s %s', (handler, method, path) => {
    expect(Reflect.getMetadata(METHOD_METADATA, controller[handler])).toBe(method);
    expect(Reflect.getMetadata(PATH_METADATA, controller[handler])).toBe(path);
  });

  it('forwards the caller to findAll so the service can scope by role', async () => {
    userService.findAll.mockResolvedValue({ items: [] });
    const query = { page: 1, size: 10 } as GetAllUserRequestDto;

    await controller.findAll(currentUser, query);

    expect(userService.findAll).toHaveBeenCalledWith(query, {}, currentUser);
  });

  it('forwards the caller to findOne so the service can scope by role', async () => {
    userService.findOne.mockResolvedValue({ slug: 'other-slug' });

    const response = await controller.findOne(currentUser, 'other-slug');

    expect(userService.findOne).toHaveBeenCalledWith(currentUser, 'other-slug');
    expect(response.result).toEqual({ slug: 'other-slug' });
    expect(response.statusCode).toBe(200);
  });

  it('renders the delete count as a message string', async () => {
    userService.deleteUser.mockResolvedValue(1);

    const response = await controller.deleteUser(currentUser, 'other-slug');

    expect(userService.deleteUser).toHaveBeenCalledWith(currentUser, 'other-slug');
    expect(response.result).toBe('1 user have been deleted successfully');
  });
});
