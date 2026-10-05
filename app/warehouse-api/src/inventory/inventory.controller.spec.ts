import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

describe('InventoryController', () => {
  let controller: InventoryController;
  const inventoryService = {
    assignMaterial: jest.fn(),
    findAll: jest.fn(),
    updateThresholds: jest.fn(),
    adjustQuantity: jest.fn(),
    removeMaterial: jest.fn(),
    findHistories: jest.fn(),
  };
  const actor = { userId: 'user-id-1', scope: [] };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: inventoryService }],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // `warehouseSlug` đến từ URL cha, `materialSlug` từ URL con — đảo thứ tự 2 tham số này là lỗi
  // im lặng (cả 2 đều là string), nên khoá lại bằng test.
  it('passes warehouseSlug then materialSlug through to the service, in that order', async () => {
    inventoryService.adjustQuantity.mockResolvedValue({ quantity: 5 });

    await controller.adjustQuantity('wh-slug-1', 'mat-slug-1', { delta: 5 }, actor);

    expect(inventoryService.adjustQuantity).toHaveBeenCalledWith(
      'wh-slug-1',
      'mat-slug-1',
      { delta: 5 },
      actor,
    );
  });

  it('wraps the assign result in AppResponseDto', async () => {
    inventoryService.assignMaterial.mockResolvedValue({ slug: 'wm-slug-1' });
    const dto = { materialSlug: 'mat-slug-1' };

    const response = await controller.assignMaterial('wh-slug-1', dto, actor);

    expect(inventoryService.assignMaterial).toHaveBeenCalledWith('wh-slug-1', dto, actor);
    expect(response.statusCode).toBe(201);
  });

  it('renders the remove count as a message string', async () => {
    inventoryService.removeMaterial.mockResolvedValue(1);

    const response = await controller.removeMaterial('wh-slug-1', 'mat-slug-1', actor);

    expect(inventoryService.removeMaterial).toHaveBeenCalledWith('wh-slug-1', 'mat-slug-1', actor);

    expect(response.result).toBe('1 inventory have been removed successfully');
  });

  // Quyền nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service không check role —
  // gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào khác phát hiện.
  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.assignMaterial)).toEqual([
        AuthorityCode.MaterialUpdate,
        AuthorityCode.WarehouseUpdate,
      ]);
      expect(authority(controller.findAll)).toEqual([
        AuthorityCode.MaterialRead,
        AuthorityCode.WarehouseRead,
      ]);
      expect(authority(controller.updateThresholds)).toEqual([
        AuthorityCode.MaterialUpdate,
        AuthorityCode.WarehouseUpdate,
      ]);
      expect(authority(controller.adjustQuantity)).toEqual([
        AuthorityCode.MaterialUpdate,
        AuthorityCode.WarehouseUpdate,
      ]);
      expect(authority(controller.removeMaterial)).toEqual([
        AuthorityCode.MaterialUpdate,
        AuthorityCode.WarehouseUpdate,
      ]);
      expect(authority(controller.findHistories)).toEqual([
        AuthorityCode.MaterialRead,
        AuthorityCode.WarehouseRead,
      ]);
    });
  });
});
