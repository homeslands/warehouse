import { Test, TestingModule } from '@nestjs/testing';
import { MaterialTypeController } from './material-type.controller';
import { MaterialTypeService } from './material-type.service';
import { HAS_ROLE_KEY } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';

describe('MaterialTypeController', () => {
  let controller: MaterialTypeController;
  const materialTypeService = {
    createMaterialType: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateMaterialType: jest.fn(),
    deleteMaterialType: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialTypeController],
      providers: [{ provide: MaterialTypeService, useValue: materialTypeService }],
    }).compile();

    controller = module.get<MaterialTypeController>(MaterialTypeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('wraps the create result in AppResponseDto', async () => {
    materialTypeService.createMaterialType.mockResolvedValue({ slug: 'type-slug-1' });
    const dto = { name: 'Tiêu hao', code: 'MT-01' };

    const response = await controller.createMaterialType(dto);

    expect(materialTypeService.createMaterialType).toHaveBeenCalledWith(dto);
    expect(response.result).toEqual({ slug: 'type-slug-1' });
    expect(response.statusCode).toBe(201);
  });

  it('renders the delete count as a message string', async () => {
    materialTypeService.deleteMaterialType.mockResolvedValue(1);

    const response = await controller.deleteMaterialType('type-slug-1');

    expect(response.result).toBe('1 material type have been deleted successfully');
  });

  // Quyền nằm hoàn toàn ở decorator (`HasRoleGuard` đọc metadata này), service không check role.
  describe('@HasRole metadata', () => {
    const roles = (handler: (...args: never[]) => unknown): RoleEnum[] | undefined =>
      Reflect.getMetadata(HAS_ROLE_KEY, handler);

    it('restricts every write route to ADMIN', () => {
      expect(roles(controller.createMaterialType)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.updateMaterialType)).toEqual([RoleEnum.Admin]);
      expect(roles(controller.deleteMaterialType)).toEqual([RoleEnum.Admin]);
    });

    it('opens the read routes to ADMIN, MANAGER and SUPERVISOR', () => {
      const readRoles = [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor];
      expect(roles(controller.findAll)).toEqual(readRoles);
      expect(roles(controller.findOne)).toEqual(readRoles);
    });
  });
});
