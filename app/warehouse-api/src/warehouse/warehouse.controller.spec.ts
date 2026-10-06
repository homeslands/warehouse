import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { CurrentUserDto } from 'src/user/user.decorator';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

const currentUser = { userId: 'user-id-1', scope: [] } as CurrentUserDto;

describe('WarehouseController', () => {
  let controller: WarehouseController;
  const warehouseService = {
    createWarehouse: jest.fn(),
    findAll: jest.fn(),
    findMine: jest.fn(),
    findOne: jest.fn(),
    updateWarehouse: jest.fn(),
    assignManager: jest.fn(),
    assignMember: jest.fn(),
    removeMember: jest.fn(),
    findAvailableMembers: jest.fn(),
    deleteWarehouse: jest.fn(),
  };

  const createDto = {
    name: 'Kho Hà Nội 1',
    code: 'WH-HN-01',
    address: 'Số 1, Cầu Giấy, Hà Nội',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WarehouseController],
      providers: [{ provide: WarehouseService, useValue: warehouseService }],
    }).compile();

    controller = module.get<WarehouseController>(WarehouseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('wraps createWarehouse result in AppResponseDto', async () => {
    warehouseService.createWarehouse.mockResolvedValue({ slug: 'wh-slug-1', ...createDto });

    const response = await controller.createWarehouse(createDto);

    expect(warehouseService.createWarehouse).toHaveBeenCalledWith(createDto);
    expect(response.result).toMatchObject({ slug: 'wh-slug-1' });
    expect(response.statusCode).toBe(201);
  });

  it('forwards the query and current user to findAll', async () => {
    const query = { page: 1, size: 10, hasManager: false };
    warehouseService.findAll.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findAll(currentUser, query);

    expect(warehouseService.findAll).toHaveBeenCalledWith(query, currentUser);
    expect(response.statusCode).toBe(200);
  });

  it('scopes findMine to the current user id', async () => {
    const query = { page: 1, size: 10 };
    warehouseService.findMine.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findMine(currentUser, query);

    expect(warehouseService.findMine).toHaveBeenCalledWith('user-id-1', query);
    expect(response.statusCode).toBe(200);
  });

  it('forwards the slug to findOne', async () => {
    warehouseService.findOne.mockResolvedValue({ slug: 'wh-slug-1' });

    const response = await controller.findOne('wh-slug-1');

    expect(warehouseService.findOne).toHaveBeenCalledWith('wh-slug-1');
    expect(response.result).toEqual({ slug: 'wh-slug-1' });
  });

  it('forwards slug and body to updateWarehouse', async () => {
    const body = createDto;
    warehouseService.updateWarehouse.mockResolvedValue({ slug: 'wh-slug-1' });

    const response = await controller.updateWarehouse('wh-slug-1', body);

    expect(warehouseService.updateWarehouse).toHaveBeenCalledWith('wh-slug-1', body);
    expect(response.statusCode).toBe(200);
  });

  it('forwards slug and body to assignManager', async () => {
    const body = { managerSlug: 'manager-slug-1' };
    warehouseService.assignManager.mockResolvedValue({ slug: 'wh-slug-1' });

    await controller.assignManager('wh-slug-1', body);

    expect(warehouseService.assignManager).toHaveBeenCalledWith('wh-slug-1', body);
  });

  it('passes a null managerSlug through without coercing it away', async () => {
    const body = { managerSlug: null };
    warehouseService.assignManager.mockResolvedValue({ slug: 'wh-slug-1' });

    await controller.assignManager('wh-slug-1', body);

    expect(warehouseService.assignManager).toHaveBeenCalledWith('wh-slug-1', {
      managerSlug: null,
    });
  });

  it('renders the delete count as a message string', async () => {
    warehouseService.deleteWarehouse.mockResolvedValue(1);

    const response = await controller.deleteWarehouse('wh-slug-1');

    expect(response.result).toBe('1 warehouse have been deleted successfully');
    expect(response.statusCode).toBe(200);
  });

  it('assignMember wraps the service result with 200', async () => {
    warehouseService.assignMember.mockResolvedValue({ slug: 'm-slug-1' });

    const response = await controller.assignMember('wh-slug-1', { userSlug: 'member-slug-1' });

    expect(warehouseService.assignMember).toHaveBeenCalledWith('wh-slug-1', {
      userSlug: 'member-slug-1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.result).toEqual({ slug: 'm-slug-1' });
  });

  it('removeMember passes both slugs and wraps the result', async () => {
    warehouseService.removeMember.mockResolvedValue(1);

    const response = await controller.removeMember('wh-slug-1', 'member-slug-1');

    expect(warehouseService.removeMember).toHaveBeenCalledWith('wh-slug-1', 'member-slug-1');
    expect(response.statusCode).toBe(200);
    expect(response.result).toBe('1 warehouse member have been removed successfully');
  });

  it('forwards slug and query to findAvailableMembers', async () => {
    const query = { page: 1, size: 10, roleSlug: 'supervisor' };
    warehouseService.findAvailableMembers.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findAvailableMembers('wh-slug-1', query);

    expect(warehouseService.findAvailableMembers).toHaveBeenCalledWith('wh-slug-1', query);
    expect(response.statusCode).toBe(200);
  });

  // Quyền nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service không check role —
  // gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào khác phát hiện.
  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.createWarehouse)).toEqual([AuthorityCode.WarehouseCreate]);
      expect(authority(controller.findAll)).toEqual([AuthorityCode.WarehouseRead]);
      expect(authority(controller.findOne)).toEqual([AuthorityCode.WarehouseRead]);
      expect(authority(controller.updateWarehouse)).toEqual([AuthorityCode.WarehouseUpdate]);
      expect(authority(controller.assignManager)).toEqual([AuthorityCode.WarehouseAssignManager]);
      expect(authority(controller.assignMember)).toEqual([
        AuthorityCode.WarehouseUpdate,
        AuthorityCode.UserRead,
      ]);
      expect(authority(controller.findAvailableMembers)).toEqual([
        AuthorityCode.WarehouseUpdate,
        AuthorityCode.UserRead,
      ]);
      expect(authority(controller.removeMember)).toEqual([
        AuthorityCode.WarehouseUpdate,
        AuthorityCode.UserRead,
      ]);
      expect(authority(controller.deleteWarehouse)).toEqual([AuthorityCode.WarehouseDelete]);
    });

    // `mine` cố tình không gắn decorator: service đã giới hạn theo `userId` của chính người gọi.
    it('leaves /mine open to any authenticated user', () => {
      expect(authority(controller.findMine)).toBeUndefined();
    });
  });
});
