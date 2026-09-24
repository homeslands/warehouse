import { Test, TestingModule } from '@nestjs/testing';
import { TaxProfileController } from './tax-profile.controller';
import { TaxProfileService } from './tax-profile.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

describe('TaxProfileController', () => {
  let controller: TaxProfileController;
  const taxProfileService = {
    findAll: jest.fn(),
    lookup: jest.fn(),
    refresh: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaxProfileController],
      providers: [{ provide: TaxProfileService, useValue: taxProfileService }],
    }).compile();

    controller = module.get<TaxProfileController>(TaxProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('forwards the query untouched to findAll', async () => {
    const query = { page: 1, size: 10 };
    taxProfileService.findAll.mockResolvedValue({ items: [], total: 0 });

    const response = await controller.findAll(query);

    expect(taxProfileService.findAll).toHaveBeenCalledWith(query);
    expect(response.statusCode).toBe(200);
  });

  it('unwraps the param DTO before calling lookup', async () => {
    taxProfileService.lookup.mockResolvedValue({ taxCode: '0101245486' });

    const response = await controller.lookup({ taxCode: '0101245486' });

    expect(taxProfileService.lookup).toHaveBeenCalledWith('0101245486');
    expect(response.result).toMatchObject({ taxCode: '0101245486' });
    expect(response.statusCode).toBe(200);
  });

  it('unwraps the param DTO before calling refresh', async () => {
    taxProfileService.refresh.mockResolvedValue({ taxCode: '0101245486' });

    const response = await controller.refresh({ taxCode: '0101245486' });

    expect(taxProfileService.refresh).toHaveBeenCalledWith('0101245486');
    expect(response.statusCode).toBe(200);
  });

  // Quyền nằm hoàn toàn ở decorator (`AuthorityGuard` đọc metadata này), service không check role —
  // gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào khác phát hiện.
  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.findAll)).toEqual([AuthorityCode.TaxProfileRead]);
      expect(authority(controller.lookup)).toEqual([AuthorityCode.TaxProfileRead]);
      expect(authority(controller.refresh)).toEqual([AuthorityCode.TaxProfileUpdate]);
    });
  });
});
