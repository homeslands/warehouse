import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseMaterialController } from './warehouse-material.controller';
import { WarehouseMaterialService } from './warehouse-material.service';
import { HAS_ROLE_KEY } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';

describe('WarehouseMaterialController', () => {
  let controller: WarehouseMaterialController;
  const warehouseMaterialService = {
    assignMaterial: jest.fn(),
    findAll: jest.fn(),
    updateThresholds: jest.fn(),
    adjustQuantity: jest.fn(),
    removeMaterial: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WarehouseMaterialController],
      providers: [{ provide: WarehouseMaterialService, useValue: warehouseMaterialService }],
    }).compile();

    controller = module.get<WarehouseMaterialController>(WarehouseMaterialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // `warehouseSlug` đến từ URL cha, `materialSlug` từ URL con — đảo thứ tự 2 tham số này là lỗi
  // im lặng (cả 2 đều là string), nên khoá lại bằng test.
  it('passes warehouseSlug then materialSlug through to the service, in that order', async () => {
    warehouseMaterialService.adjustQuantity.mockResolvedValue({ quantity: 5 });

    await controller.adjustQuantity('wh-slug-1', 'mat-slug-1', { delta: 5 });

    expect(warehouseMaterialService.adjustQuantity).toHaveBeenCalledWith(
      'wh-slug-1',
      'mat-slug-1',
      { delta: 5 },
    );
  });

  it('wraps the assign result in AppResponseDto', async () => {
    warehouseMaterialService.assignMaterial.mockResolvedValue({ slug: 'wm-slug-1' });
    const dto = { materialSlug: 'mat-slug-1' };

    const response = await controller.assignMaterial('wh-slug-1', dto);

    expect(warehouseMaterialService.assignMaterial).toHaveBeenCalledWith('wh-slug-1', dto);
    expect(response.statusCode).toBe(201);
  });

  it('renders the remove count as a message string', async () => {
    warehouseMaterialService.removeMaterial.mockResolvedValue(1);

    const response = await controller.removeMaterial('wh-slug-1', 'mat-slug-1');

    expect(response.result).toBe('1 warehouse material have been removed successfully');
  });

  describe('@HasRole metadata', () => {
    const roles = (handler: (...args: never[]) => unknown): RoleEnum[] | undefined =>
      Reflect.getMetadata(HAS_ROLE_KEY, handler);

    it('restricts every write route, including the stock adjustment, to ADMIN', () => {
      expect(roles(controller.assignMaterial)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.updateThresholds)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.adjustQuantity)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.removeMaterial)).toEqual([RoleEnum.Admin]);
    });

    it('opens the read route to ADMIN, MANAGER and SUPERVISOR', () => {
      expect(roles(controller.findAll)).toEqual([
        RoleEnum.Admin,
        RoleEnum.Manager,
        RoleEnum.Supervisor,
      ]);
    });
  });
});
