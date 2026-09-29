import { Test, TestingModule } from '@nestjs/testing';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { CurrentUserDto } from 'src/user/user.decorator';

describe('RoleController', () => {
  let controller: RoleController;
  const roleService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const currentUser: CurrentUserDto = { userId: 'u', roleName: 'ADMIN', scope: [] };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleController],
      providers: [{ provide: RoleService, useValue: roleService }],
    }).compile();

    controller = module.get<RoleController>(RoleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the caller to the service and renders the delete count', async () => {
    roleService.remove.mockResolvedValue(1);

    const response = await controller.remove(currentUser, 'team-lead');

    expect(roleService.remove).toHaveBeenCalledWith(currentUser, 'team-lead');
    expect(response.result).toBe('1 role have been deleted successfully');
    expect(response.statusCode).toBe(200);
  });

  // Quyền nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này) — gỡ/sửa nhầm decorator là
  // mở endpoint cho mọi user đã đăng nhập mà không test nào khác phát hiện.
  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.findAll)).toEqual([AuthorityCode.RoleRead]);
      expect(authority(controller.findOne)).toEqual([AuthorityCode.RoleRead]);
      expect(authority(controller.create)).toEqual([AuthorityCode.RoleCreate]);
      expect(authority(controller.update)).toEqual([AuthorityCode.RoleUpdate]);
      expect(authority(controller.remove)).toEqual([AuthorityCode.RoleDelete]);
    });
  });
});
