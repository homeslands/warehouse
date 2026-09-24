import { Test, TestingModule } from '@nestjs/testing';
import { MaterialController } from './material.controller';
import { MaterialService } from './material.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

describe('MaterialController', () => {
  let controller: MaterialController;
  const materialService = {
    createMaterial: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateMaterial: jest.fn(),
    deleteMaterial: jest.fn(),
    findConversionUnits: jest.fn(),
    findAvailableConversionUnits: jest.fn(),
    addConversionUnit: jest.fn(),
    updateConversionUnit: jest.fn(),
    removeConversionUnit: jest.fn(),
    convertQuantity: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialController],
      providers: [{ provide: MaterialService, useValue: materialService }],
    }).compile();

    controller = module.get<MaterialController>(MaterialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forwards the query untouched to findAll', async () => {
    const query = { page: 1, size: 10, typeSlug: 'type-slug-1' };
    materialService.findAll.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findAll(query);

    expect(materialService.findAll).toHaveBeenCalledWith(query);
    expect(response.statusCode).toBe(200);
  });

  it('wraps the create result in AppResponseDto', async () => {
    materialService.createMaterial.mockResolvedValue({ slug: 'mat-slug-1' });
    const dto = { code: 'MAT-001', name: 'Găng tay', typeSlug: 'type-slug-1' };

    const response = await controller.createMaterial(dto);

    expect(response.result).toEqual({ slug: 'mat-slug-1' });
    expect(response.statusCode).toBe(201);
  });

  it('forwards slug + query to findConversionUnits', async () => {
    const query = { page: 1, size: 10, code: 'KG' };
    materialService.findConversionUnits.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findConversionUnits('mat-slug-1', query);

    expect(materialService.findConversionUnits).toHaveBeenCalledWith('mat-slug-1', query);
    expect(response.statusCode).toBe(200);
  });

  it('forwards slug + query to findAvailableConversionUnits', async () => {
    const query = { page: 1, size: 10 };
    materialService.findAvailableConversionUnits.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findAvailableConversionUnits('mat-slug-1', query);

    expect(materialService.findAvailableConversionUnits).toHaveBeenCalledWith('mat-slug-1', query);
    expect(response.statusCode).toBe(200);
  });

  it('wraps the attach result in AppResponseDto with 201', async () => {
    const dto = { unitSlug: 'unit-slug-9', conversionRate: 50 };
    materialService.addConversionUnit.mockResolvedValue({ unitSlug: 'unit-slug-9' });

    const response = await controller.addConversionUnit('mat-slug-1', dto);

    expect(materialService.addConversionUnit).toHaveBeenCalledWith('mat-slug-1', dto);
    expect(response.statusCode).toBe(201);
  });

  it('passes both path params to updateConversionUnit', async () => {
    const dto = { conversionRate: 25 };
    materialService.updateConversionUnit.mockResolvedValue({ unitSlug: 'unit-slug-9' });

    const response = await controller.updateConversionUnit('mat-slug-1', 'unit-slug-9', dto);

    expect(materialService.updateConversionUnit).toHaveBeenCalledWith(
      'mat-slug-1',
      'unit-slug-9',
      dto,
    );
    expect(response.statusCode).toBe(200);
  });

  it('wraps the convert result in AppResponseDto with 200', async () => {
    const dto = { quantity: 5, fromUnitSlug: 'unit-slug-9', toUnitSlug: 'unit-slug-1' };
    materialService.convertQuantity.mockResolvedValue({ toQuantity: 250 });

    const response = await controller.convertQuantity('mat-slug-1', dto);

    expect(materialService.convertQuantity).toHaveBeenCalledWith('mat-slug-1', dto);
    expect(response.result).toEqual({ toQuantity: 250 });
    expect(response.statusCode).toBe(200);
  });

  it('renders the detach count as a message string', async () => {
    materialService.removeConversionUnit.mockResolvedValue(1);

    const response = await controller.removeConversionUnit('mat-slug-1', 'unit-slug-9');

    expect(response.result).toBe('1 conversion unit have been detached successfully');
  });

  // Quyền nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service không check role —
  // gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào khác phát hiện.
  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.createMaterial)).toEqual([AuthorityCode.MaterialCreate]);
      expect(authority(controller.findAll)).toEqual([AuthorityCode.MaterialRead]);
      expect(authority(controller.findOne)).toEqual([AuthorityCode.MaterialRead]);
      expect(authority(controller.updateMaterial)).toEqual([AuthorityCode.MaterialUpdate]);
      expect(authority(controller.deleteMaterial)).toEqual([AuthorityCode.MaterialDelete]);
      expect(authority(controller.findConversionUnits)).toEqual([
        AuthorityCode.MaterialRead,
        AuthorityCode.UnitRead,
      ]);
      expect(authority(controller.findAvailableConversionUnits)).toEqual([
        AuthorityCode.MaterialRead,
        AuthorityCode.UnitRead,
      ]);
      expect(authority(controller.convertQuantity)).toEqual([
        AuthorityCode.MaterialRead,
        AuthorityCode.UnitRead,
      ]);
      expect(authority(controller.addConversionUnit)).toEqual([
        AuthorityCode.MaterialUpdate,
        AuthorityCode.UnitUpdate,
      ]);
      expect(authority(controller.updateConversionUnit)).toEqual([
        AuthorityCode.MaterialUpdate,
        AuthorityCode.UnitUpdate,
      ]);
      expect(authority(controller.removeConversionUnit)).toEqual([
        AuthorityCode.MaterialUpdate,
        AuthorityCode.UnitUpdate,
      ]);
    });
  });
});
