import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { CurrentUserDto } from 'src/user/user.decorator';
import { HAS_ROLE_KEY } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';

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

  it('forwards the query untouched to findAll', async () => {
    const query = { page: 1, size: 10, hasManager: false };
    warehouseService.findAll.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findAll(query);

    expect(warehouseService.findAll).toHaveBeenCalledWith(query);
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
    const body = { ...createDto, version: 2 };
    warehouseService.updateWarehouse.mockResolvedValue({ slug: 'wh-slug-1', version: 3 });

    const response = await controller.updateWarehouse('wh-slug-1', body);

    expect(warehouseService.updateWarehouse).toHaveBeenCalledWith('wh-slug-1', body);
    expect(response.statusCode).toBe(200);
  });

  it('forwards slug and body to assignManager', async () => {
    const body = { managerSlug: 'manager-slug-1', version: 1 };
    warehouseService.assignManager.mockResolvedValue({ slug: 'wh-slug-1', version: 2 });

    await controller.assignManager('wh-slug-1', body);

    expect(warehouseService.assignManager).toHaveBeenCalledWith('wh-slug-1', body);
  });

  it('passes a null managerSlug through without coercing it away', async () => {
    const body = { managerSlug: null, version: 1 };
    warehouseService.assignManager.mockResolvedValue({ slug: 'wh-slug-1', version: 2 });

    await controller.assignManager('wh-slug-1', body);

    expect(warehouseService.assignManager).toHaveBeenCalledWith('wh-slug-1', {
      managerSlug: null,
      version: 1,
    });
  });

  it('renders the delete count as a message string', async () => {
    warehouseService.deleteWarehouse.mockResolvedValue(1);

    const response = await controller.deleteWarehouse('wh-slug-1');

    expect(response.result).toBe('1 warehouse have been deleted successfully');
    expect(response.statusCode).toBe(200);
  });

  // Quyền của cả module nằm hoàn toàn ở decorator (`HasRoleGuard` đọc metadata này), service không
  // check role — gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào
  // khác phát hiện ra.
  describe('@HasRole metadata', () => {
    const roles = (handler: (...args: never[]) => unknown): RoleEnum[] | undefined =>
      Reflect.getMetadata(HAS_ROLE_KEY, handler);

    it('restricts every write route to ADMIN', () => {
      expect(roles(controller.createWarehouse)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.updateWarehouse)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.assignManager)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.deleteWarehouse)).toEqual([RoleEnum.Admin]);
    });

    it('opens the read routes to ADMIN, MANAGER and SUPERVISOR', () => {
      const readRoles = [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor];
      expect(roles(controller.findAll)).toEqual(readRoles);
      expect(roles(controller.findOne)).toEqual(readRoles);
    });

    // `mine` cố tình không gắn decorator: service đã giới hạn theo `userId` của chính người gọi.
    it('leaves /mine open to any authenticated user', () => {
      expect(roles(controller.findMine)).toBeUndefined();
    });
  });
});
