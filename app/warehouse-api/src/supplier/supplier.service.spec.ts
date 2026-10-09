import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Between, In, IsNull, LessThanOrEqual, Like, MoreThanOrEqual } from 'typeorm';
import { SupplierService } from './supplier.service';
import { SupplierProfile } from './supplier.mapper';
import { Supplier } from './supplier.entity';
import { SupplierTransaction } from './supplier-transaction.entity';
import { SupplierException } from './supplier.exception';
import { SupplierValidation } from './supplier.validation';
import { SupplierTransactionType } from './supplier.constants';
import { Material } from 'src/material/material.entity';
import { MaterialException } from 'src/material/material.exception';
import { CurrentUserDto } from 'src/user/user.decorator';

describe('SupplierService', () => {
  let service: SupplierService;
  const supplierRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    softRemove: jest.fn(),
  };
  const transactionRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };
  const materialRepository = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    countBy: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const transactionManager = { update: jest.fn() };

  const supplier = { id: 'sup-1', slug: 's1', code: 'NCC-01', name: 'Supplier A' } as Supplier;
  const actor = { userId: 'u1' } as CurrentUserDto;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierService,
        SupplierProfile,
        { provide: getRepositoryToken(Supplier), useValue: supplierRepository },
        { provide: getRepositoryToken(SupplierTransaction), useValue: transactionRepository },
        { provide: getRepositoryToken(Material), useValue: materialRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();

    service = module.get<SupplierService>(SupplierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('does not filter when code is omitted', async () => {
      supplierRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, size: 10 });

      expect(supplierRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filters by exact code', async () => {
      supplierRepository.findAndCount.mockResolvedValue([[supplier], 1]);

      const result = await service.findAll({ page: 1, size: 10, code: 'NCC-01' });

      expect(supplierRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'NCC-01' } }),
      );
      expect(result).toMatchObject({ total: 1, items: [{ code: 'NCC-01' }] });
    });

    it('ANDs exact taxCode / substring phonenumber without search', async () => {
      supplierRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, size: 10, taxCode: '0101234567', phonenumber: '0241' });

      expect(supplierRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taxCode: '0101234567', phonenumber: Like('%0241%') },
        }),
      );
    });

    it('ORs search across name / contactPerson / email, each branch keeping the other filters', async () => {
      supplierRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, size: 10, code: 'NCC-01', search: 'abc' });

      const keyword = Like('%abc%');
      expect(supplierRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [
            { code: 'NCC-01', name: keyword },
            { code: 'NCC-01', contactPerson: keyword },
            { code: 'NCC-01', email: keyword },
          ],
        }),
      );
    });
  });

  describe('createSupplier', () => {
    it('upper-cases code and saves when code is free', async () => {
      supplierRepository.findOne.mockResolvedValue(null);
      supplierRepository.create.mockImplementation((data) => data);
      supplierRepository.save.mockImplementation(async (data) => ({ ...data, id: 'x' }));

      const result = await service.createSupplier({ code: 'ncc-01', name: ' Supplier A ' });

      expect(result).toMatchObject({ code: 'NCC-01', name: 'Supplier A' });
    });

    it('throws CODE_DOES_EXIST / CODE_RESERVED_BY_DELETED_SUPPLIER', async () => {
      supplierRepository.findOne.mockResolvedValueOnce({ id: 'x' });
      await expect(service.createSupplier({ code: 'NCC-01', name: 'A' })).rejects.toMatchObject({
        code: SupplierValidation.SUPPLIER_CODE_DOES_EXIST.code,
      });

      supplierRepository.findOne.mockResolvedValueOnce({ id: 'x', deletedAt: new Date() });
      await expect(service.createSupplier({ code: 'NCC-01', name: 'A' })).rejects.toBeInstanceOf(
        SupplierException,
      );
    });
  });

  describe('updateSupplier — partial (PATCH)', () => {
    it('keeps fields that were not sent and skips the code check', async () => {
      supplierRepository.findOneBy.mockResolvedValue({ ...supplier, phonenumber: '0912345678' });
      supplierRepository.save.mockImplementation(async (data) => data);

      const result = await service.updateSupplier('s1', { address: 'Hà Nội' });

      expect(result).toMatchObject({
        code: 'NCC-01',
        name: 'Supplier A',
        phonenumber: '0912345678',
        address: 'Hà Nội',
      });
      expect(supplierRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('deleteSupplier', () => {
    it('refuses while materials are still attached', async () => {
      supplierRepository.findOneBy.mockResolvedValue(supplier);
      materialRepository.countBy.mockResolvedValue(2);

      await expect(service.deleteSupplier('s1')).rejects.toBeInstanceOf(SupplierException);
      expect(supplierRepository.softRemove).not.toHaveBeenCalled();
    });

    it('soft-removes when no material is attached', async () => {
      supplierRepository.findOneBy.mockResolvedValue(supplier);
      materialRepository.countBy.mockResolvedValue(0);

      await expect(service.deleteSupplier('s1')).resolves.toBe(1);
      expect(supplierRepository.softRemove).toHaveBeenCalledWith(supplier);
    });
  });

  describe('findMaterials', () => {
    beforeEach(() => supplierRepository.findOneBy.mockResolvedValue(supplier));

    it('scopes to the supplier and paginates when no filter is given', async () => {
      materialRepository.findAndCount.mockResolvedValue([[], 25]);

      const result = await service.findMaterials('s1', { page: 2, size: 10 });

      expect(materialRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { supplier: { id: 'sup-1' } }, skip: 10, take: 10 }),
      );
      expect(result).toMatchObject({ total: 25, page: 2, totalPages: 3, hasNext: true });
    });

    it('ANDs typeSlug / exact code / substring name with the supplier scope', async () => {
      materialRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findMaterials('s1', {
        page: 1,
        size: 10,
        typeSlug: 'tp1',
        code: 'MAT-001',
        name: 'thep',
      });

      expect(materialRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            supplier: { id: 'sup-1' },
            type: { slug: 'tp1' },
            code: 'MAT-001',
            name: Like('%thep%'),
          },
        }),
      );
    });

    it('filters createdAt by an inclusive from/to range', async () => {
      materialRepository.findAndCount.mockResolvedValue([[], 0]);
      const from = '2026-09-01T00:00:00.000Z';
      const to = '2026-09-30T23:59:59.999Z';

      await service.findMaterials('s1', { page: 1, size: 10, from, to });

      expect(materialRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { supplier: { id: 'sup-1' }, createdAt: Between(new Date(from), new Date(to)) },
        }),
      );
    });

    it('uses an open-ended bound when only from or only to is given', async () => {
      materialRepository.findAndCount.mockResolvedValue([[], 0]);
      const date = '2026-09-01T00:00:00.000Z';

      await service.findMaterials('s1', { page: 1, size: 10, from: date });
      await service.findMaterials('s1', { page: 1, size: 10, to: date });

      const [first, second] = materialRepository.findAndCount.mock.calls;
      expect(first[0].where.createdAt).toEqual(MoreThanOrEqual(new Date(date)));
      expect(second[0].where.createdAt).toEqual(LessThanOrEqual(new Date(date)));
    });
  });

  describe('attach / detach materials (batch)', () => {
    const body = (...materialSlugs: string[]) => ({ materialSlugs });
    const update = () => transactionManager.update;

    beforeEach(() => {
      supplierRepository.findOneBy.mockResolvedValue(supplier);
      materialRepository.manager.transaction.mockImplementation(async (run) =>
        run(transactionManager),
      );
    });

    it('attaches only the free materials in one guarded UPDATE, skipping already-owned ones', async () => {
      materialRepository.find.mockResolvedValue([
        { id: 'm-1', slug: 'm1', supplier: null },
        { id: 'm-2', slug: 'm2', supplier: { id: 'sup-1' } },
        { id: 'm-3', slug: 'm3', supplier: null },
      ]);
      update().mockResolvedValue({ affected: 2 });

      const result = await service.attachMaterials('s1', body('m1', 'm2', 'm3'));

      expect(materialRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: In(['m1', 'm2', 'm3']) } }),
      );
      expect(update()).toHaveBeenCalledWith(
        Material,
        { id: In(['m-1', 'm-3']), supplier: IsNull() },
        { supplier: { id: 'sup-1' } },
      );
      expect(result.map((item) => item.slug)).toEqual(['m1', 'm2', 'm3']);
    });

    it('is a no-op when every material already belongs to this supplier', async () => {
      materialRepository.find.mockResolvedValue([{ id: 'm-1', supplier: { id: 'sup-1' } }]);

      await service.attachMaterials('s1', body('m1'));

      expect(materialRepository.manager.transaction).not.toHaveBeenCalled();
    });

    it('refuses the whole batch if one material belongs to another supplier', async () => {
      materialRepository.find.mockResolvedValue([
        { id: 'm-1', supplier: null },
        { id: 'm-2', supplier: { id: 'other' } },
      ]);

      await expect(service.attachMaterials('s1', body('m1', 'm2'))).rejects.toMatchObject({
        code: SupplierValidation.SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER.code,
      });
      expect(update()).not.toHaveBeenCalled();
    });

    // Vật tư bị nhà cung cấp khác gắn chen giữa lúc đọc và lúc ghi: throw trong transaction ⇒ rollback.
    it('rolls back when a material gets taken between read and write', async () => {
      materialRepository.find.mockResolvedValue([
        { id: 'm-1', supplier: null },
        { id: 'm-2', supplier: null },
      ]);
      update().mockResolvedValue({ affected: 1 });

      await expect(service.attachMaterials('s1', body('m1', 'm2'))).rejects.toMatchObject({
        code: SupplierValidation.SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER.code,
      });
    });

    it('throws MATERIAL_NOT_FOUND when any slug is unknown, de-duplicating slugs first', async () => {
      materialRepository.find.mockResolvedValue([{ id: 'm-1', supplier: null }]);

      await expect(
        service.attachMaterials('s1', body('m1', 'm1', 'missing')),
      ).rejects.toBeInstanceOf(MaterialException);
      expect(materialRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: In(['m1', 'missing']) } }),
      );
      expect(update()).not.toHaveBeenCalled();
    });

    it('detaches every material with a guarded UPDATE and returns the count', async () => {
      materialRepository.find.mockResolvedValue([
        { id: 'm-1', supplier: { id: 'sup-1' } },
        { id: 'm-2', supplier: { id: 'sup-1' } },
      ]);
      update().mockResolvedValue({ affected: 2 });

      await expect(service.detachMaterials('s1', body('m1', 'm2'))).resolves.toBe(2);
      expect(update()).toHaveBeenCalledWith(
        Material,
        { id: In(['m-1', 'm-2']), supplier: { id: 'sup-1' } },
        { supplier: null },
      );
    });

    it('detach refuses the whole batch if one material is not attached to this supplier', async () => {
      materialRepository.find.mockResolvedValue([
        { id: 'm-1', supplier: { id: 'sup-1' } },
        { id: 'm-2', supplier: null },
      ]);

      await expect(service.detachMaterials('s1', body('m1', 'm2'))).rejects.toMatchObject({
        code: SupplierValidation.SUPPLIER_MATERIAL_NOT_ATTACHED.code,
      });
      expect(update()).not.toHaveBeenCalled();
    });

    it('detach rolls back when a material changed between read and write', async () => {
      materialRepository.find.mockResolvedValue([{ id: 'm-1', supplier: { id: 'sup-1' } }]);
      update().mockResolvedValue({ affected: 0 });

      await expect(service.detachMaterials('s1', body('m1'))).rejects.toMatchObject({
        code: SupplierValidation.SUPPLIER_MATERIAL_NOT_ATTACHED.code,
      });
    });
  });

  describe('createTransaction', () => {
    beforeEach(() => {
      supplierRepository.findOneBy.mockResolvedValue(supplier);
      transactionRepository.create.mockImplementation((data) => data);
      transactionRepository.save.mockImplementation(async (data) => ({ ...data, id: 't-1' }));
      transactionRepository.findOne.mockResolvedValue(null);
    });

    it('PURCHASE: computes amount = quantity × unitPrice, rounded to 2 decimals', async () => {
      materialRepository.findOne.mockResolvedValue({ id: 'm-1', slug: 'm1', supplier });

      const result = await service.createTransaction(actor, 's1', {
        type: SupplierTransactionType.Purchase,
        materialSlug: 'm1',
        quantity: 1.333333,
        unitPrice: 3,
        amount: 999999, // bị bỏ qua
      });

      expect(transactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 1.333333,
          unitPrice: 3,
          amount: 4,
          performedBy: { id: 'u1' },
        }),
      );
      expect(result).toMatchObject({ type: 'PURCHASE', amount: 4 });
    });

    it('PURCHASE: refuses a material not attached to this supplier', async () => {
      materialRepository.findOne.mockResolvedValue({ id: 'm-1', supplier: { id: 'other' } });

      await expect(
        service.createTransaction(actor, 's1', {
          type: SupplierTransactionType.Purchase,
          materialSlug: 'm1',
          quantity: 1,
          unitPrice: 1,
        }),
      ).rejects.toMatchObject({
        code: SupplierValidation.SUPPLIER_MATERIAL_NOT_ATTACHED.code,
      });
      expect(transactionRepository.save).not.toHaveBeenCalled();
    });

    it('PAYMENT: stores amount only', async () => {
      await service.createTransaction(actor, 's1', {
        type: SupplierTransactionType.Payment,
        amount: 500000,
      });

      const saved = transactionRepository.save.mock.calls[0][0];
      expect(saved).toMatchObject({ type: 'PAYMENT', amount: 500000 });
      expect(saved.material).toBeUndefined();
      expect(materialRepository.findOne).not.toHaveBeenCalled();
    });

    it('PAYMENT: refuses material fields', async () => {
      await expect(
        service.createTransaction(actor, 's1', {
          type: SupplierTransactionType.Payment,
          amount: 1,
          materialSlug: 'm1',
        }),
      ).rejects.toMatchObject({
        code: SupplierValidation.SUPPLIER_TRANSACTION_PAYMENT_HAS_MATERIAL.code,
      });
    });
  });

  describe('findTransactions', () => {
    it('throws when supplier is not found', async () => {
      supplierRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.findTransactions('missing', { page: 1, size: 10 }),
      ).rejects.toBeInstanceOf(SupplierException);
    });

    it('filters by supplier/type and reads soft-deleted relations', async () => {
      supplierRepository.findOneBy.mockResolvedValue(supplier);
      transactionRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findTransactions('s1', {
        page: 1,
        size: 10,
        type: SupplierTransactionType.Payment,
      });

      expect(transactionRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { supplier: { id: 'sup-1' }, type: 'PAYMENT' },
          withDeleted: true,
        }),
      );
    });
  });
});
