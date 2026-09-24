import { Test, TestingModule } from '@nestjs/testing';
import { UnitController } from './unit.controller';
import { UnitService } from './unit.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

describe('UnitController', () => {
  let controller: UnitController;
  const unitService = {
    createUnit: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateUnit: jest.fn(),
    deleteUnit: jest.fn(),
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

  // Quyền nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service không check role —
  // gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào khác phát hiện.
  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.createUnit)).toEqual([AuthorityCode.UnitCreate]);
      expect(authority(controller.findAll)).toEqual([AuthorityCode.UnitRead]);
      expect(authority(controller.findOne)).toEqual([AuthorityCode.UnitRead]);
      expect(authority(controller.updateUnit)).toEqual([AuthorityCode.UnitUpdate]);
      expect(authority(controller.deleteUnit)).toEqual([AuthorityCode.UnitDelete]);
    });
  });
});
