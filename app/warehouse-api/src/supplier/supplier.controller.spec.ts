import { Test, TestingModule } from '@nestjs/testing';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

describe('SupplierController', () => {
  let controller: SupplierController;
  const supplierService = {
    createSupplier: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateSupplier: jest.fn(),
    deleteSupplier: jest.fn(),
    findMaterials: jest.fn(),
    attachMaterials: jest.fn(),
    detachMaterials: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupplierController],
      providers: [{ provide: SupplierService, useValue: supplierService }],
    }).compile();

    controller = module.get<SupplierController>(SupplierController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('wraps createSupplier result in AppResponseDto', async () => {
    supplierService.createSupplier.mockResolvedValue({ slug: 's1', code: 'NCC-01' });

    const response = await controller.createSupplier({ code: 'NCC-01', name: 'Supplier A' });

    expect(response.result).toEqual({ slug: 's1', code: 'NCC-01' });
    expect(response.statusCode).toBe(201);
  });

  it('wraps findOne result in AppResponseDto', async () => {
    supplierService.findOne.mockResolvedValue({ slug: 's1', code: 'NCC-01' });

    const response = await controller.findOne('s1');

    expect(supplierService.findOne).toHaveBeenCalledWith('s1');
    expect(response.result).toEqual({ slug: 's1', code: 'NCC-01' });
  });

  it('forwards the batch body to attachMaterials / detachMaterials', async () => {
    const body = { materialSlugs: ['m1', 'm2'] };
    supplierService.attachMaterials.mockResolvedValue([{ slug: 'm1' }, { slug: 'm2' }]);
    supplierService.detachMaterials.mockResolvedValue(2);

    const attached = await controller.attachMaterials('s1', body);
    const detached = await controller.detachMaterials('s1', body);

    expect(supplierService.attachMaterials).toHaveBeenCalledWith('s1', body);
    expect(attached.result).toEqual([{ slug: 'm1' }, { slug: 'm2' }]);
    expect(supplierService.detachMaterials).toHaveBeenCalledWith('s1', body);
    expect(detached.result).toBe('2 material have been detached successfully');
  });

  describe('@RequireAuthority metadata', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    it('maps every route to its authority code', () => {
      expect(authority(controller.createSupplier)).toEqual([AuthorityCode.SupplierCreate]);
      expect(authority(controller.findAll)).toEqual([AuthorityCode.SupplierRead]);
      expect(authority(controller.findOne)).toEqual([AuthorityCode.SupplierRead]);
      expect(authority(controller.updateSupplier)).toEqual([AuthorityCode.SupplierUpdate]);
      expect(authority(controller.deleteSupplier)).toEqual([AuthorityCode.SupplierDelete]);
      expect(authority(controller.findMaterials)).toEqual([
        AuthorityCode.SupplierRead,
        AuthorityCode.MaterialRead,
      ]);
      expect(authority(controller.attachMaterials)).toEqual([
        AuthorityCode.SupplierUpdate,
        AuthorityCode.MaterialUpdate,
      ]);
      expect(authority(controller.detachMaterials)).toEqual([
        AuthorityCode.SupplierUpdate,
        AuthorityCode.MaterialUpdate,
      ]);
    });
  });
});
