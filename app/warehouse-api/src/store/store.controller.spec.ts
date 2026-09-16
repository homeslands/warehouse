import { Test, TestingModule } from '@nestjs/testing';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { HAS_ROLE_KEY } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';

describe('StoreController', () => {
  let controller: StoreController;
  const storeService = {
    createStore: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStore: jest.fn(),
    deleteStore: jest.fn(),
  };

  const createDto = {
    name: 'Cửa hàng Hà Nội 1',
    code: 'ST-HN-01',
    legalName: 'Công ty TNHH ABC',
    taxCode: '0101234567',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoreController],
      providers: [{ provide: StoreService, useValue: storeService }],
    }).compile();

    controller = module.get<StoreController>(StoreController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('wraps createStore result in AppResponseDto', async () => {
    storeService.createStore.mockResolvedValue({ slug: 'st-slug-1', ...createDto });

    const response = await controller.createStore(createDto);

    expect(storeService.createStore).toHaveBeenCalledWith(createDto);
    expect(response.result).toMatchObject({ slug: 'st-slug-1' });
    expect(response.statusCode).toBe(201);
  });

  it('forwards the query untouched to findAll', async () => {
    const query = { page: 1, size: 10, isActive: false };
    storeService.findAll.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findAll(query);

    expect(storeService.findAll).toHaveBeenCalledWith(query);
    expect(response.statusCode).toBe(200);
  });

  it('passes the slug through to findOne', async () => {
    storeService.findOne.mockResolvedValue({ slug: 'st-slug-1' });

    const response = await controller.findOne('st-slug-1');

    expect(storeService.findOne).toHaveBeenCalledWith('st-slug-1');
    expect(response.statusCode).toBe(200);
  });

  it('passes the slug and body through to updateStore', async () => {
    const updateDto = { ...createDto, version: 2 };
    storeService.updateStore.mockResolvedValue({ slug: 'st-slug-1', version: 3 });

    const response = await controller.updateStore('st-slug-1', updateDto);

    expect(storeService.updateStore).toHaveBeenCalledWith('st-slug-1', updateDto);
    expect(response.result).toMatchObject({ version: 3 });
    expect(response.statusCode).toBe(200);
  });

  it('renders the deleteStore count as a message string', async () => {
    storeService.deleteStore.mockResolvedValue(1);

    const response = await controller.deleteStore('st-slug-1');

    expect(response.result).toBe('1 store have been deleted successfully');
    expect(response.statusCode).toBe(200);
  });

  // Quyền của cả module nằm hoàn toàn ở decorator (`HasRoleGuard` đọc metadata này), service không
  // check role — gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào
  // khác phát hiện ra.
  describe('@HasRole metadata', () => {
    const roles = (handler: (...args: never[]) => unknown): RoleEnum[] | undefined =>
      Reflect.getMetadata(HAS_ROLE_KEY, handler);

    it('restricts every write route to ADMIN', () => {
      expect(roles(controller.createStore)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.updateStore)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.deleteStore)).toEqual([RoleEnum.Admin]);
    });

    it('opens the read routes to ADMIN, MANAGER and SUPERVISOR', () => {
      const readRoles = [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor];
      expect(roles(controller.findAll)).toEqual(readRoles);
      expect(roles(controller.findOne)).toEqual(readRoles);
    });
  });
});
