import { Test, TestingModule } from '@nestjs/testing';
import { MaterialTypeController } from './material-type.controller';
import { MaterialTypeService } from './material-type.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

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

  // Quyền nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service không check role —
  // gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào khác phát hiện.
  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.createMaterialType)).toEqual([AuthorityCode.MaterialCreate]);
      expect(authority(controller.findAll)).toEqual([AuthorityCode.MaterialRead]);
      expect(authority(controller.findOne)).toEqual([AuthorityCode.MaterialRead]);
      expect(authority(controller.updateMaterialType)).toEqual([AuthorityCode.MaterialUpdate]);
      expect(authority(controller.deleteMaterialType)).toEqual([AuthorityCode.MaterialDelete]);
    });
  });
});
