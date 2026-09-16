import { Test, TestingModule } from '@nestjs/testing';
import { TaxProfileController } from './tax-profile.controller';
import { TaxProfileService } from './tax-profile.service';
import { HAS_ROLE_KEY } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';

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

  // Quyền của cả module nằm hoàn toàn ở decorator (`HasRoleGuard` đọc metadata này), service không
  // check role — gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập mà không test nào
  // khác phát hiện ra.
  describe('@HasRole metadata', () => {
    const roles = (handler: (...args: never[]) => unknown): RoleEnum[] | undefined =>
      Reflect.getMetadata(HAS_ROLE_KEY, handler);

    it('opens the read routes to ADMIN, MANAGER and SUPERVISOR', () => {
      const readRoles = [RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor];
      expect(roles(controller.findAll)).toEqual(readRoles);
      expect(roles(controller.lookup)).toEqual(readRoles);
    });

    // `refresh` là đường DUY NHẤT gọi thẳng ra bên thứ ba — mở cho role khác là mở đường nện
    // upstream, nên rào này phải giữ nguyên ADMIN.
    it('restricts refresh to ADMIN', () => {
      expect(roles(controller.refresh)).toEqual([RoleEnum.Admin]);
    });
  });
});
