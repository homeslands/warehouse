import { Test, TestingModule } from '@nestjs/testing';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { SupplierTransactionType } from './supplier.constants';
import { CurrentUserDto } from 'src/user/user.decorator';

describe('SupplierController', () => {
  let controller: SupplierController;
  const supplierService = {
    createSupplier: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateSupplier: jest.fn(),
    deleteSupplier: jest.fn(),
    findMaterials: jest.fn(),
    attachMaterial: jest.fn(),
    detachMaterial: jest.fn(),
    findTransactions: jest.fn(),
    createTransaction: jest.fn(),
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

  it('passes the current user to createTransaction', async () => {
    const user = { userId: 'u1' } as CurrentUserDto;
    const dto = { type: SupplierTransactionType.Payment, amount: 1000 };
    supplierService.createTransaction.mockResolvedValue({ slug: 't1' });

    const response = await controller.createTransaction(user, 's1', dto);

    expect(supplierService.createTransaction).toHaveBeenCalledWith(user, 's1', dto);
    expect(response.statusCode).toBe(201);
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
      expect(authority(controller.attachMaterial)).toEqual([
        AuthorityCode.SupplierUpdate,
        AuthorityCode.MaterialUpdate,
      ]);
      expect(authority(controller.detachMaterial)).toEqual([
        AuthorityCode.SupplierUpdate,
        AuthorityCode.MaterialUpdate,
      ]);
      expect(authority(controller.findTransactions)).toEqual([AuthorityCode.SupplierRead]);
      expect(authority(controller.createTransaction)).toEqual([AuthorityCode.SupplierUpdate]);
    });
  });
});
