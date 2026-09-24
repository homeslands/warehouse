import { Test, TestingModule } from '@nestjs/testing';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

describe('StoreController', () => {
  let controller: StoreController;
  const storeService = {
    createStore: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStore: jest.fn(),
    assignWarehouse: jest.fn(),
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
    const updateDto = createDto;
    storeService.updateStore.mockResolvedValue({ slug: 'st-slug-1' });

    const response = await controller.updateStore('st-slug-1', updateDto);

    expect(storeService.updateStore).toHaveBeenCalledWith('st-slug-1', updateDto);
    expect(response.result).toMatchObject({});
    expect(response.statusCode).toBe(200);
  });

  it('passes the slug and body through to assignWarehouse', async () => {
    const assignDto = { warehouseSlug: 'wh-slug-1' };
    storeService.assignWarehouse.mockResolvedValue({
      slug: 'st-slug-1',
      warehouseSlug: 'wh-slug-1',
    });

    const response = await controller.assignWarehouse('st-slug-1', assignDto);

    expect(storeService.assignWarehouse).toHaveBeenCalledWith('st-slug-1', assignDto);
    expect(response.result).toMatchObject({ warehouseSlug: 'wh-slug-1' });
    expect(response.statusCode).toBe(200);
  });

  it('forwards a null warehouseSlug (unassign) untouched', async () => {
    const assignDto = { warehouseSlug: null };
    storeService.assignWarehouse.mockResolvedValue({ slug: 'st-slug-1' });

    await controller.assignWarehouse('st-slug-1', assignDto);

    expect(storeService.assignWarehouse).toHaveBeenCalledWith('st-slug-1', assignDto);
  });

  it('renders the deleteStore count as a message string', async () => {
    storeService.deleteStore.mockResolvedValue(1);

    const response = await controller.deleteStore('st-slug-1');

    expect(response.result).toBe('1 store have been deleted successfully');
    expect(response.statusCode).toBe(200);
  });

  // Quyền nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service không check role —
  // gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào khác phát hiện.
  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.createStore)).toEqual([AuthorityCode.StoreCreate]);
      expect(authority(controller.findAll)).toEqual([AuthorityCode.StoreRead]);
      expect(authority(controller.findOne)).toEqual([AuthorityCode.StoreRead]);
      expect(authority(controller.updateStore)).toEqual([AuthorityCode.StoreUpdate]);
      expect(authority(controller.assignWarehouse)).toEqual([
        AuthorityCode.StoreUpdate,
        AuthorityCode.WarehouseUpdate,
      ]);
      expect(authority(controller.deleteStore)).toEqual([AuthorityCode.StoreDelete]);
    });
  });
});
