import { Test, TestingModule } from '@nestjs/testing';
import { UnitController } from './unit.controller';
import { UnitService } from './unit.service';
import { HAS_ROLE_KEY } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';

describe('UnitController', () => {
  let controller: UnitController;
  const unitService = {
    createUnit: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateUnit: jest.fn(),
    deleteUnit: jest.fn(),
    countMaterialsUsing: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnitController],
      providers: [{ provide: UnitService, useValue: unitService }],
    }).compile();

    controller = module.get<UnitController>(UnitController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('wraps the create result in AppResponseDto', async () => {
    unitService.createUnit.mockResolvedValue({ slug: 'unit-slug-1' });
    const dto = { name: 'Kilogram', code: 'KG' };

    const response = await controller.createUnit(dto);

    expect(unitService.createUnit).toHaveBeenCalledWith(dto);
    expect(response.result).toEqual({ slug: 'unit-slug-1' });
    expect(response.statusCode).toBe(201);
  });

  it('wraps the update result in AppResponseDto', async () => {
    unitService.updateUnit.mockResolvedValue({ slug: 'unit-slug-1', name: 'Kilôgam' });
    const dto = { name: 'Kilôgam', version: 1 };

    const response = await controller.updateUnit('unit-slug-1', dto);

    expect(unitService.updateUnit).toHaveBeenCalledWith('unit-slug-1', dto);
    expect(response.result).toEqual({ slug: 'unit-slug-1', name: 'Kilôgam' });
    expect(response.statusCode).toBe(200);
  });

  it('renders the delete count as a message string', async () => {
    unitService.deleteUnit.mockResolvedValue(1);

    const response = await controller.deleteUnit('unit-slug-1');

    expect(response.result).toBe('1 unit have been deleted successfully');
  });

  it('wraps the material-count result in AppResponseDto', async () => {
    const count = {
      unitSlug: 'unit-slug-1',
      unitCode: 'KG',
      asBaseUnit: 3,
      asConversionUnit: 7,
      total: 9,
    };
    unitService.countMaterialsUsing.mockResolvedValue(count);

    const response = await controller.countMaterialsUsing('unit-slug-1');

    expect(unitService.countMaterialsUsing).toHaveBeenCalledWith('unit-slug-1');
    expect(response.result).toEqual(count);
    expect(response.statusCode).toBe(200);
  });

  // Quyền nằm hoàn toàn ở decorator (`HasRoleGuard` đọc metadata này), service không check role.
  describe('@HasRole metadata', () => {
    const roles = (handler: (...args: never[]) => unknown): RoleEnum[] | undefined =>
      Reflect.getMetadata(HAS_ROLE_KEY, handler);

    it('restricts every write route to ADMIN', () => {
      expect(roles(controller.createUnit)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.updateUnit)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.deleteUnit)).toEqual([RoleEnum.Admin]);
    });

    it('opens the read routes to ADMIN, MANAGER and SUPERVISOR', () => {
      const readRoles = [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor];
      expect(roles(controller.findAll)).toEqual(readRoles);
      expect(roles(controller.findOne)).toEqual(readRoles);
      expect(roles(controller.countMaterialsUsing)).toEqual(readRoles);
    });
  });
});
