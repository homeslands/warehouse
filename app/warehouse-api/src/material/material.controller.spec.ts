import { Test, TestingModule } from '@nestjs/testing';
import { MaterialController } from './material.controller';
import { MaterialService } from './material.service';
import { HAS_ROLE_KEY } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';

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

  it('renders the detach count as a message string', async () => {
    materialService.removeConversionUnit.mockResolvedValue(1);

    const response = await controller.removeConversionUnit('mat-slug-1', 'unit-slug-9');

    expect(response.result).toBe('1 conversion unit have been detached successfully');
  });

  describe('@HasRole metadata', () => {
    const roles = (handler: (...args: never[]) => unknown): RoleEnum[] | undefined =>
      Reflect.getMetadata(HAS_ROLE_KEY, handler);

    it('restricts every write route to ADMIN', () => {
      expect(roles(controller.createMaterial)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.updateMaterial)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.deleteMaterial)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.addConversionUnit)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.updateConversionUnit)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.removeConversionUnit)).toEqual([RoleEnum.Admin]);
    });

    it('opens the read routes to ADMIN, MANAGER and SUPERVISOR', () => {
      const readRoles = [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor];
      expect(roles(controller.findAll)).toEqual(readRoles);
      expect(roles(controller.findOne)).toEqual(readRoles);
      expect(roles(controller.findConversionUnits)).toEqual(readRoles);
      expect(roles(controller.findAvailableConversionUnits)).toEqual(readRoles);
    });
  });
});
