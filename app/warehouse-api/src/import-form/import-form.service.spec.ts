import { Inventory } from 'src/inventory/inventory.entity';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { InventoryValidation } from 'src/inventory/inventory.validation';
import { InventoryException } from 'src/inventory/inventory.exception';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ImportFormService } from './import-form.service';
import { SortOrder } from 'src/app/base.dto';
import { AppCommonValidation } from 'src/app/app-common.validation';
import { ImportFormProfile } from './import-form.mapper';
import { ImportForm } from './import-form.entity';
import { ImportFormStatus } from './import-form.constants';
import { ImportFormException } from './import-form.exception';
import { ImportFormValidation } from './import-form.validation';
import { CreateImportFormRequestDto, ImportFormSortBy } from './import-form.dto';
import { AuthorityCode } from 'src/authority/authority.constants';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { Material } from 'src/material/material.entity';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierValidation } from 'src/supplier/supplier.validation';
import { ImportFormItem } from './import-form-item.entity';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { S3Service } from 'src/file/s3/s3.service';
import { FileValidation } from 'src/file/file.validation';
import { insertMaterialSuppliers } from 'src/material/material-supplier.util';

// Bảng join `material_supplier_tbl` ghi qua `material-supplier.util.ts` (có spec riêng).
jest.mock('src/material/material-supplier.util');

describe('ImportFormService', () => {
  let service: ImportFormService;
  const importFormRepository = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softRemove: jest.fn(),
  };
  const warehouseRepository = { findOneBy: jest.fn() };
  const userRepository = { findOneBy: jest.fn() };
  const materialRepository = { find: jest.fn() };
  const supplierRepository = { find: jest.fn() };
  const inventoryRepository = { find: jest.fn(), findAndCount: jest.fn() };
  // Mặc định: mọi vật tư được hỏi đều đã gán vào kho (trả 1 dòng tồn cho mỗi id trong `In(...)`).
  const allAssigned = async ({ where }: { where: { material: { id: { value: string[] } } } }) =>
    where.material.id.value.map((id) => ({ material: { id } }));
  // `execute` chạy thẳng callback với `manager` giả — đủ để kiểm mọi lần ghi đều đi qua transaction.
  // Rollback thật do `TransactionManagerService` lo (xem `transaction-manager.service.spec.ts`).
  const manager = { save: jest.fn(), delete: jest.fn(), findOne: jest.fn() };
  const inventoryService = { receive: jest.fn() };
  const transactionManager = { execute: jest.fn() };
  const s3Service = { uploadFile: jest.fn(), getFileUrl: jest.fn() };

  const supplier = {
    id: 'sup-1',
    slug: 'sup-slug',
    code: 'NCC-01',
    name: 'Supplier A',
    taxCode: '0101234567',
    address: 'Hanoi',
  } as Supplier;

  // Vật tư base = KG, gắn thêm BAO (1 BAO = 50 KG), chỉ có 1 nhà cung cấp (A).
  const kg = { id: 'unit-kg', slug: 'kg', code: 'KG', name: 'Kilogram' };
  const bag = { id: 'unit-bag', slug: 'bag', code: 'BAO', name: 'Bao' };
  const cement = {
    id: 'mat-1',
    slug: 'cement',
    code: 'XM-01',
    name: 'Xi mang',
    suppliers: [supplier],
    unitsCanHave: [
      { unit: kg, conversionRate: 1 },
      { unit: bag, conversionRate: 50 },
    ],
  } as unknown as Material;

  const warehouse = { id: 'wh-1', slug: 'wh-slug', isActive: true } as Warehouse;
  const requester = { id: 'u1', slug: 'u1-slug', firstName: 'An', lastName: 'Nguyen' } as User;
  const approver = { id: 'u2', slug: 'u2-slug', firstName: 'Binh', lastName: 'Tran' } as User;

  const createDto: CreateImportFormRequestDto = {
    code: 'pn-0001',
    invoiceCode: 'HD-1',
    date: '2026-10-12',
    items: [
      { materialSlug: 'cement', unitSlug: 'bag', quantity: 2, unitPrice: 400 },
      { materialSlug: 'cement', unitSlug: 'kg', quantity: 0.5, unitPrice: 9.99, note: 'loose' },
    ],
  };

  const actor = (scope: string[] = [], userId = 'u1', roleName?: string): CurrentUserDto => ({
    userId,
    roleName,
    scope,
  });

  const draft = (overrides: Partial<ImportForm> = {}): ImportForm =>
    ({
      id: 'form-1',
      slug: 'form-slug',
      code: 'PN-0001',
      invoiceCode: 'HD-1',
      requester,
      requesterName: 'Nguyen An',
      approver: null,
      approverName: null,
      date: '2026-10-12',
      total: 1000,
      status: ImportFormStatus.Draft,
      warehouse,
      version: 1,
      createdAt: new Date('2026-10-12T00:00:00Z'),
      updatedAt: new Date('2026-10-12T00:00:00Z'),
      ...overrides,
    }) as ImportForm;

  const expectError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toMatchObject({ code });
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    importFormRepository.create.mockImplementation((data) => data);
    importFormRepository.save.mockImplementation(async (data) => data);
    manager.save.mockImplementation(async (data) => data);
    transactionManager.execute.mockImplementation(async (onSave) => onSave(manager));
    inventoryRepository.find.mockImplementation(allAssigned);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportFormService,
        ImportFormProfile,
        { provide: getRepositoryToken(ImportForm), useValue: importFormRepository },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Material), useValue: materialRepository },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepository },
        { provide: getRepositoryToken(Inventory), useValue: inventoryRepository },
        { provide: TransactionManagerService, useValue: transactionManager },
        { provide: InventoryService, useValue: inventoryService },
        { provide: S3Service, useValue: s3Service },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();

    service = module.get<ImportFormService>(ImportFormService);
  });

  describe('createImportForm', () => {
    beforeEach(() => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findOne.mockResolvedValue(null);
      userRepository.findOneBy.mockResolvedValue(requester);
      materialRepository.find.mockResolvedValue([cement]);
    });

    it('builds items with snapshots, base quantity and amount, and computes total', async () => {
      const result = await service.createImportForm('wh-slug', createDto, actor());

      const saved = manager.save.mock.calls[0][0];
      expect(saved.items).toHaveLength(2);
      expect(saved.items[0]).toBeInstanceOf(ImportFormItem);
      expect(saved.items).toEqual([
        expect.objectContaining({
          lineNo: 1,
          material: cement,
          materialCode: 'XM-01',
          materialName: 'Xi mang',
          unit: bag,
          unitCode: 'BAO',
          unitName: 'Bao',
          quantity: 2,
          conversionRate: 50,
          baseQuantity: 100,
          unitPrice: 400,
          amount: 800,
          note: null,
        }),
        expect.objectContaining({
          lineNo: 2,
          unit: kg,
          conversionRate: 1,
          baseQuantity: 0.5,
          amount: 5, // 0.5 × 9.99 = 4.995 → làm tròn 2 chữ số
          note: 'loose',
        }),
      ]);
      expect(saved.total).toBe(805);
      expect(result).toMatchObject({
        total: 805,
        items: [
          { lineNo: 1, materialSlug: 'cement', unitSlug: 'bag', amount: 800 },
          { lineNo: 2, materialSlug: 'cement', unitSlug: 'kg', amount: 5 },
        ],
      });
      expect(materialRepository.find).toHaveBeenCalledTimes(1);
    });

    it('snapshots the material supplier on every line (form header has no supplier)', async () => {
      const result = await service.createImportForm('wh-slug', createDto, actor());

      expect(materialRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ relations: expect.objectContaining({ suppliers: true }) }),
      );
      const saved = manager.save.mock.calls[0][0];
      expect(saved).not.toHaveProperty('supplier');
      saved.items.forEach((item: ImportFormItem) =>
        expect(item).toMatchObject({
          supplierSlug: 'sup-slug',
          supplierCode: 'NCC-01',
          supplierName: 'Supplier A',
          supplierTaxCode: '0101234567',
          supplierAddress: 'Hanoi',
        }),
      );
      expect(result.items?.[0]).toMatchObject({
        supplierSlug: 'sup-slug',
        supplierName: 'Supplier A',
      });
    });

    const nullSupplier = {
      supplierSlug: null,
      supplierCode: null,
      supplierName: null,
      supplierTaxCode: null,
      supplierAddress: null,
    };
    const supplierB = {
      id: 'sup-2',
      slug: 'sup-b',
      code: 'NCC-02',
      name: 'Supplier B',
      taxCode: '0109999999',
      address: 'HCMC',
    } as Supplier;
    const savedItems = (): ImportFormItem[] => manager.save.mock.calls[0][0].items;

    it('writes null supplier snapshot columns when the material has no supplier', async () => {
      materialRepository.find.mockResolvedValue([{ ...cement, suppliers: [] }]);

      await service.createImportForm('wh-slug', createDto, actor());

      savedItems().forEach((item) => expect(item).toMatchObject(nullSupplier));
    });

    // n - n: không tự đoán khi vật tư có nhiều nhà cung cấp và dòng không chỉ rõ.
    it('writes null supplier when the material has several suppliers and the line names none', async () => {
      materialRepository.find.mockResolvedValue([{ ...cement, suppliers: [supplier, supplierB] }]);

      await service.createImportForm('wh-slug', createDto, actor());

      savedItems().forEach((item) => expect(item).toMatchObject(nullSupplier));
    });

    it('snapshots the supplier named by items[].supplierSlug', async () => {
      materialRepository.find.mockResolvedValue([{ ...cement, suppliers: [supplier, supplierB] }]);
      const dto = {
        ...createDto,
        items: createDto.items.map((item) => ({ ...item, supplierSlug: 'sup-b' })),
      };

      await service.createImportForm('wh-slug', dto, actor());

      savedItems().forEach((item) =>
        expect(item).toMatchObject({
          supplierSlug: 'sup-b',
          supplierCode: 'NCC-02',
          supplierName: 'Supplier B',
          supplierTaxCode: '0109999999',
          supplierAddress: 'HCMC',
        }),
      );
    });

    it('does not touch the supplier join table when every supplier is already attached', async () => {
      const dto = {
        ...createDto,
        items: createDto.items.map((item) => ({ ...item, supplierSlug: 'sup-slug' })),
      };

      await service.createImportForm('wh-slug', dto, actor());

      expect(supplierRepository.find).not.toHaveBeenCalled();
      expect(insertMaterialSuppliers).toHaveBeenCalledWith(manager, []);
    });

    it('auto-attaches a supplier not yet attached to the material, in the SAME transaction', async () => {
      supplierRepository.find.mockResolvedValue([supplierB]);
      const dto = {
        ...createDto,
        items: createDto.items.map((item) => ({ ...item, supplierSlug: 'sup-b' })),
      };

      await service.createImportForm('wh-slug', dto, actor());

      expect(supplierRepository.find).toHaveBeenCalledTimes(1);
      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      // 2 dòng cùng cặp (vật tư, nhà cung cấp) ⇒ chỉ gắn 1 lần.
      expect(insertMaterialSuppliers).toHaveBeenCalledTimes(1);
      expect(insertMaterialSuppliers).toHaveBeenCalledWith(manager, [
        { materialId: 'mat-1', supplierId: 'sup-2' },
      ]);
      savedItems().forEach((item) =>
        expect(item).toMatchObject({ supplierSlug: 'sup-b', supplierCode: 'NCC-02' }),
      );
    });

    it('rejects an unknown supplierSlug before opening a transaction', async () => {
      supplierRepository.find.mockResolvedValue([]);
      const dto = {
        ...createDto,
        items: [{ ...createDto.items[0], supplierSlug: 'missing' }],
      };

      await expectError(
        service.createImportForm('wh-slug', dto, actor()),
        SupplierValidation.SUPPLIER_NOT_FOUND.code,
      );
      expect(transactionManager.execute).not.toHaveBeenCalled();
      expect(insertMaterialSuppliers).not.toHaveBeenCalled();
    });

    it('writes the form and its items in ONE transaction, items pointing at the saved form', async () => {
      await service.createImportForm('wh-slug', createDto, actor());

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(importFormRepository.save).not.toHaveBeenCalled();
      const [[form], [items]] = manager.save.mock.calls;
      expect(form).toMatchObject({ code: 'PN-0001' });
      expect(items).toHaveLength(2);
      items.forEach((item: ImportFormItem) => expect(item.importForm).toBe(form));
    });

    it('propagates an error while saving items (transaction rolls back the form)', async () => {
      manager.save
        .mockImplementationOnce(async (data) => data)
        .mockRejectedValueOnce(new Error('ER_NO_REFERENCED_ROW'));

      await expect(service.createImportForm('wh-slug', createDto, actor())).rejects.toThrow(
        'ER_NO_REFERENCED_ROW',
      );
      expect(importFormRepository.save).not.toHaveBeenCalled();
    });

    // Lỗi nghiệp vụ của dòng bị chặn trước khi mở transaction — không chạm DB.
    it('does not open a transaction when an item is invalid', async () => {
      materialRepository.find.mockResolvedValue([]);

      await expect(service.createImportForm('wh-slug', createDto, actor())).rejects.toBeDefined();
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });

    it('rejects the same material + unit twice', async () => {
      const item = createDto.items[0];

      await expectError(
        service.createImportForm('wh-slug', { ...createDto, items: [item, { ...item }] }, actor()),
        ImportFormValidation.IMPORT_FORM_ITEM_DUPLICATED.code,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects an unknown material', async () => {
      materialRepository.find.mockResolvedValue([]);

      await expectError(
        service.createImportForm('wh-slug', createDto, actor()),
        ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND.code,
      );
    });

    it('rejects a unit that is not attached to the material', async () => {
      await expectError(
        service.createImportForm(
          'wh-slug',
          { ...createDto, items: [{ ...createDto.items[0], unitSlug: 'litre' }] },
          actor(),
        ),
        ImportFormValidation.IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL.code,
      );
    });

    it.each([0, -1, Number.NaN])('rejects a dirty conversion rate %p from the DB', async (rate) => {
      materialRepository.find.mockResolvedValue([
        { ...cement, unitsCanHave: [{ unit: bag, conversionRate: rate }] },
      ]);

      await expectError(
        service.createImportForm('wh-slug', { ...createDto, items: [createDto.items[0]] }, actor()),
        ImportFormValidation.IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID.code,
      );
    });

    it('rejects a base quantity that overflows DECIMAL(18,6)', async () => {
      await expectError(
        service.createImportForm(
          'wh-slug',
          { ...createDto, items: [{ ...createDto.items[0], quantity: 1e11 }] }, // × 50
          actor(),
        ),
        ImportFormValidation.IMPORT_FORM_ITEM_QUANTITY_INVALID.code,
      );
    });

    it('rejects a total that overflows DECIMAL(18,2)', async () => {
      await expectError(
        service.createImportForm(
          'wh-slug',
          {
            ...createDto,
            items: [{ ...createDto.items[1], quantity: 1e9, unitPrice: 1e8 }],
          },
          actor(),
        ),
        ImportFormValidation.IMPORT_FORM_TOTAL_INVALID.code,
      );
    });

    it('creates a DRAFT with requester snapshot and an uppercased code', async () => {
      const result = await service.createImportForm('wh-slug', createDto, actor());

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'PN-0001',
          status: ImportFormStatus.Draft,
          requester,
          requesterName: 'Nguyen An',
          approver: null,
          approverName: null,
          warehouse,
        }),
      );
      expect(result).toMatchObject({
        code: 'PN-0001',
        status: ImportFormStatus.Draft,
        requesterSlug: 'u1-slug',
        approverSlug: null,
        warehouseSlug: 'wh-slug',
        total: 805,
      });
      expect(result).not.toHaveProperty('id');
    });

    it('rejects an inactive warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue({ ...warehouse, isActive: false });

      await expectError(
        service.createImportForm('wh-slug', createDto, actor()),
        ImportFormValidation.IMPORT_FORM_WAREHOUSE_INACTIVE.code,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('returns WAREHOUSE_NOT_FOUND for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.createImportForm('nope', createDto, actor()),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });

    it.each([
      ['an active form', undefined, ImportFormValidation.IMPORT_FORM_CODE_DOES_EXIST.code],
      [
        'a soft-deleted form',
        new Date(),
        ImportFormValidation.IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM.code,
      ],
    ])('rejects a code already held by %s', async (_label, deletedAt, code) => {
      importFormRepository.findOne.mockResolvedValue(draft({ deletedAt }));

      await expectError(service.createImportForm('wh-slug', createDto, actor()), code);
      expect(importFormRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'PN-0001' },
        withDeleted: true,
      });
    });
  });

  describe('materials must be assigned to the warehouse', () => {
    beforeEach(() => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findOne.mockResolvedValue(null);
      userRepository.findOneBy.mockResolvedValue(requester);
      materialRepository.find.mockResolvedValue([cement]);
    });

    it('looks up the inventory rows of THIS warehouse for the requested materials', async () => {
      await service.createImportForm('wh-slug', createDto, actor());

      const [{ where }] = inventoryRepository.find.mock.calls[0];
      expect(where.warehouse).toEqual({ id: 'wh-1' });
      expect(where.material.id.value).toEqual(['mat-1']);
    });

    it('rejects create when a material is not assigned to the warehouse', async () => {
      inventoryRepository.find.mockResolvedValue([]);

      await expectError(
        service.createImportForm('wh-slug', createDto, actor()),
        ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE.code,
      );
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });

    it('rejects PATCH items with a material not assigned to the form warehouse', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());
      inventoryRepository.find.mockResolvedValue([]);

      await expectError(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { items: [createDto.items[0]], version: 1 },
          actor([AuthorityCode.ImportFormUpdateDraft]),
        ),
        ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE.code,
      );
      expect(inventoryRepository.find.mock.calls[0][0].where.warehouse).toEqual({ id: 'wh-1' });
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });
  });

  describe('findAvailableMaterials', () => {
    it('lists materials assigned to the warehouse with their units (base unit first)', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      inventoryRepository.findAndCount.mockResolvedValue([
        [
          {
            quantity: 12.5,
            material: {
              ...cement,
              baseUnit: kg,
              unitsCanHave: [
                { unitId: 'unit-bag', unit: bag, conversionRate: '50.000000' },
                { unitId: 'unit-kg', unit: kg, conversionRate: '1.000000' },
              ],
            },
          },
        ],
        1,
      ]);

      const result = await service.findAvailableMaterials('wh-slug', {
        page: 1,
        size: 10,
        name: 'Xi',
      } as never);

      const [options] = inventoryRepository.findAndCount.mock.calls[0];
      expect(options.where.warehouse).toEqual({ id: 'wh-1' });
      expect(options.where.material.name.value).toBe('%Xi%');
      expect(result).toMatchObject({ total: 1, page: 1, totalPages: 1, hasNext: false });
      expect(result.items).toEqual([
        {
          slug: 'cement',
          code: 'XM-01',
          name: 'Xi mang',
          baseUnitSlug: 'kg',
          quantity: 12.5,
          suppliers: [{ slug: 'sup-slug', code: 'NCC-01', name: 'Supplier A' }],
          units: [
            {
              unitSlug: 'kg',
              unitCode: 'KG',
              unitName: 'Kilogram',
              conversionRate: 1,
              isBaseUnit: true,
            },
            {
              unitSlug: 'bag',
              unitCode: 'BAO',
              unitName: 'Bao',
              conversionRate: 50,
              isBaseUnit: false,
            },
          ],
        },
      ]);
    });

    it('returns WAREHOUSE_NOT_FOUND for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.findAvailableMaterials('nope', { page: 1, size: 10 } as never),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });
  });

  describe('findAll / findOne', () => {
    it('scopes the list to the warehouse in the route and applies filters', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findAndCount.mockResolvedValue([[draft()], 1]);

      const result = await service.findAll('wh-slug', {
        page: 1,
        size: 10,
        status: ImportFormStatus.Draft,
      });

      expect(importFormRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            warehouse: { slug: 'wh-slug' },
            status: ImportFormStatus.Draft,
          },
        }),
      );
      expect(result).toMatchObject({ total: 1, items: [{ slug: 'form-slug' }] });
      // List cố ý không load dòng vật tư (payload nhẹ); chi tiết lấy qua `GET :slug`.
      expect(importFormRepository.findAndCount.mock.calls[0][0].relations).not.toHaveProperty(
        'items',
      );
      expect(result.items[0].items).toBeUndefined(); // undefined ⇒ JSON bỏ hẳn key
    });

    it('filters createdAt by startDate / endDate and orders by sort (default DESC)', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('wh-slug', {
        page: 1,
        size: 10,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });
      await service.findAll('wh-slug', { page: 1, size: 10, sort: SortOrder.ASC });

      const [first, second] = importFormRepository.findAndCount.mock.calls.map(([opts]) => opts);
      const [from, to] = first.where.createdAt.value;
      expect(from).toMatchObject({ _type: 'moreThanOrEqual', _value: new Date(2026, 8, 1) });
      expect(to).toMatchObject({ _type: 'lessThan', _value: new Date(2026, 9, 1) });
      expect(first.order).toEqual({ createdAt: SortOrder.DESC, id: 'ASC' });
      expect(second.where).not.toHaveProperty('createdAt');
      expect(second.order).toEqual({ createdAt: SortOrder.ASC, id: 'ASC' });
    });

    it('orders by sortBy=code, rejects sortBy=name', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('wh-slug', {
        page: 1,
        size: 10,
        sortBy: ImportFormSortBy.Code,
        sort: SortOrder.ASC,
      });
      expect(importFormRepository.findAndCount.mock.calls[0][0].order).toEqual({
        code: 'ASC',
        id: 'ASC',
      });

      await expect(
        service.findAll('wh-slug', { page: 1, size: 10, sortBy: 'name' as ImportFormSortBy }),
      ).rejects.toMatchObject({ code: AppCommonValidation.SORT_BY_INVALID.code });
    });

    it('rejects startDate after endDate', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);

      await expectError(
        service.findAll('wh-slug', {
          page: 1,
          size: 10,
          startDate: '2026-09-30',
          endDate: '2026-09-01',
        }),
        ImportFormValidation.IMPORT_FORM_DATE_RANGE_INVALID.code,
      );
      expect(importFormRepository.findAndCount).not.toHaveBeenCalled();
    });

    it('returns WAREHOUSE_NOT_FOUND instead of an empty list for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.findAll('nope', { page: 1, size: 10 }),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });

    // Member của kho A không được đọc phiếu kho B qua URL của kho A.
    it('looks the form up by slug AND warehouse slug', async () => {
      importFormRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.findOne('wh-a', 'form-of-b'),
        ImportFormValidation.IMPORT_FORM_NOT_FOUND.code,
      );
      expect(importFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'form-of-b', warehouse: { slug: 'wh-a' } } }),
      );
    });
  });

  describe('updateImportForm — partial (PATCH)', () => {
    const full = () => actor([AuthorityCode.ImportFormUpdateDraft]);

    it('loads the form with an optimistic lock on the sent version', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await service.updateImportForm('wh-slug', 'form-slug', { version: 3 }, full());

      expect(importFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'optimistic', version: 3 } }),
      );
    });

    it('keeps fields that were not sent', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      const result = await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { note: 'new note', version: 1 },
        full(),
      );

      expect(result).toMatchObject({
        note: 'new note',
        code: 'PN-0001',
        invoiceCode: 'HD-1',
        total: 1000,
      });
      expect(materialRepository.find).not.toHaveBeenCalled();
    });

    it('replaces all items and recomputes total when items is sent', async () => {
      const oldItem = { id: 'old-item', lineNo: 1, amount: 1000 } as ImportFormItem;
      importFormRepository.findOne.mockResolvedValue(draft({ items: [oldItem] }));
      materialRepository.find.mockResolvedValue([cement]);

      await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { items: [createDto.items[0]], version: 1 },
        full(),
      );

      const saved = manager.save.mock.calls[0][0];
      expect(manager.delete).toHaveBeenCalledWith(ImportFormItem, ['old-item']);
      expect(saved.items).not.toContain(oldItem);
      expect(saved.items).toEqual([expect.objectContaining({ lineNo: 1, amount: 800 })]);
      expect(saved.total).toBe(800);
    });

    it('auto-attaches a supplier not yet attached to the material when items is sent', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: [] }));
      materialRepository.find.mockResolvedValue([cement]);
      supplierRepository.find.mockResolvedValue([{ ...supplier, id: 'sup-2', slug: 'sup-b' }]);

      await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { items: [{ ...createDto.items[0], supplierSlug: 'sup-b' }], version: 1 },
        full(),
      );

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(insertMaterialSuppliers).toHaveBeenCalledWith(manager, [
        { materialId: 'mat-1', supplierId: 'sup-2' },
      ]);
    });

    it('deletes the old lines before inserting the new ones, inside the transaction', async () => {
      const oldItems = [{ id: 'old-1' }, { id: 'old-2' }] as ImportFormItem[];
      importFormRepository.findOne.mockResolvedValue(draft({ items: oldItems }));
      materialRepository.find.mockResolvedValue([cement]);

      const result = await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { items: [createDto.items[0]], version: 1 },
        full(),
      );

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(ImportFormItem, ['old-1', 'old-2']);
      // UNIQUE (phiếu, vật tư, đơn vị): xoá dòng cũ phải chạy trước khi ghi dòng mới.
      const deleteOrder = manager.delete.mock.invocationCallOrder[0];
      const itemsSaveOrder = manager.save.mock.invocationCallOrder[1];
      expect(deleteOrder).toBeLessThan(itemsSaveOrder);
      expect(result.items).toEqual([expect.objectContaining({ lineNo: 1, unitSlug: 'bag' })]);
    });

    it('keeps the old lines (no delete/insert) when items is not sent', async () => {
      const oldItems = [
        { id: 'old-1', lineNo: 1, material: cement, unit: bag, amount: 1000 },
      ] as unknown as ImportFormItem[];
      importFormRepository.findOne.mockResolvedValue(draft({ items: oldItems }));

      const result = await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { note: 'x', version: 1 },
        full(),
      );

      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(result.items).toEqual([expect.objectContaining({ lineNo: 1, unitSlug: 'bag' })]);
    });

    it('propagates an error while inserting new lines (transaction rolls back the delete)', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: [{ id: 'old-1' }] as any }));
      materialRepository.find.mockResolvedValue([cement]);
      manager.save
        .mockImplementationOnce(async (data) => data)
        .mockRejectedValueOnce(new Error('ER_DUP_ENTRY'));

      await expect(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { items: [createDto.items[0]], version: 1 },
          full(),
        ),
      ).rejects.toThrow('ER_DUP_ENTRY');
    });

    it('loads items (ordered by lineNo) so the old lines can be replaced', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await service.updateImportForm('wh-slug', 'form-slug', { version: 1 }, full());

      expect(importFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: expect.objectContaining({ items: { material: true, unit: true } }),
          order: { items: { lineNo: 'ASC' } },
        }),
      );
    });

    // Automapper không kế thừa map Create -> Update: field nào thiếu `forMember` là PATCH âm thầm bỏ.
    it('applies every editable field that is sent', async () => {
      importFormRepository.findOne.mockResolvedValueOnce(draft()).mockResolvedValueOnce(null);
      const patch = {
        code: 'pn-0002',
        purchaseOrder: 'PO-9',
        invoiceCode: 'HD-9',
        date: '2026-11-01',
        file: 'import-forms/x.pdf',
        note: 'n',
      };

      const result = await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { ...patch, version: 1 },
        full(),
      );

      expect(result).toMatchObject({ ...patch, code: 'PN-0002' });
    });

    it('checks code uniqueness only when the code actually changes', async () => {
      importFormRepository.findOne.mockResolvedValueOnce(draft());

      await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { code: 'pn-0001', version: 1 },
        full(),
      );

      expect(importFormRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it.each([ImportFormStatus.Confirmed, ImportFormStatus.Cancelled])(
      'rejects a %s form',
      async (status) => {
        importFormRepository.findOne.mockResolvedValue(draft({ status }));

        await expectError(
          service.updateImportForm('wh-slug', 'form-slug', { version: 1 }, full()),
          ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
        );
        expect(manager.save).not.toHaveBeenCalled();
      },
    );

    it('lets _OWN edit a form they requested', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expect(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([AuthorityCode.ImportFormUpdateDraftOwn], 'u1'),
        ),
      ).resolves.toBeDefined();
    });

    it("rejects _OWN on someone else's form", async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expectError(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([AuthorityCode.ImportFormUpdateDraftOwn], 'someone-else'),
        ),
        ImportFormValidation.IMPORT_FORM_NOT_OWNER.code,
      );
    });

    it('returns 403 when the user has neither the full nor the _OWN authority', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expect(
        service.updateImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u1')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets SUPER_ADMIN through without any authority in scope', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expect(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { version: 1 },
          actor([], 'root', RoleEnum.SuperAdmin),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('uploadFile', () => {
    const pdf = { originalname: 'hoa don.pdf', mimetype: 'application/pdf' } as Express.Multer.File;
    const url = 'https://bucket.s3.ap-southeast-1.amazonaws.com/import-forms/hoa-don-1.pdf';

    beforeEach(() => {
      s3Service.uploadFile.mockResolvedValue('import-forms/hoa-don-1.pdf');
      s3Service.getFileUrl.mockReturnValue(url);
    });

    it.each([
      AuthorityCode.ImportFormCreate,
      AuthorityCode.ImportFormUpdateDraft,
      AuthorityCode.ImportFormUpdateDraftOwn,
    ])('uploads under import-forms/ and returns the S3 link with %s', async (code) => {
      await expect(service.uploadFile(pdf, actor([code]))).resolves.toBe(url);
      expect(s3Service.uploadFile).toHaveBeenCalledWith(pdf, 'import-forms');
      expect(s3Service.getFileUrl).toHaveBeenCalledWith('import-forms/hoa-don-1.pdf');
    });

    it('lets SUPER_ADMIN upload without any authority', async () => {
      await expect(service.uploadFile(pdf, actor([], 'root', RoleEnum.SuperAdmin))).resolves.toBe(
        url,
      );
    });

    it('rejects a user with none of the create/update authorities', async () => {
      await expect(
        service.uploadFile(pdf, actor([AuthorityCode.ImportFormRead])),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects a missing file', async () => {
      await expectError(
        service.uploadFile(undefined, actor([AuthorityCode.ImportFormCreate])),
        FileValidation.FILE_NOT_FOUND.code,
      );
    });

    it('rejects a file type outside the whitelist without touching S3', async () => {
      const html = { originalname: 'x.html', mimetype: 'text/html' } as Express.Multer.File;

      await expectError(
        service.uploadFile(html, actor([AuthorityCode.ImportFormCreate])),
        ImportFormValidation.IMPORT_FORM_FILE_TYPE_NOT_ALLOWED.code,
      );
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe('deleteImportForm', () => {
    it('soft-deletes a DRAFT form', async () => {
      const form = draft();
      importFormRepository.findOne.mockResolvedValue(form);

      await expect(
        service.deleteImportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ImportFormDeleteDraft]),
        ),
      ).resolves.toBe(1);
      expect(importFormRepository.softRemove).toHaveBeenCalledWith(form);
    });

    it('rejects a CONFIRMED form', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ status: ImportFormStatus.Confirmed }));

      await expectError(
        service.deleteImportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ImportFormDeleteDraft]),
        ),
        ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
      );
      expect(importFormRepository.softRemove).not.toHaveBeenCalled();
    });

    // Quyền sửa không kéo theo quyền xoá: check đúng cặp code DELETE.
    it('does not accept UPDATE authorities for delete', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expect(
        service.deleteImportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ImportFormUpdateDraft, AuthorityCode.ImportFormUpdateDraftOwn]),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects _OWN on someone else's form", async () => {
      importFormRepository.findOne.mockResolvedValue(draft());

      await expectError(
        service.deleteImportForm(
          'wh-slug',
          'form-slug',
          actor([AuthorityCode.ImportFormDeleteDraftOwn], 'someone-else'),
        ),
        ImportFormValidation.IMPORT_FORM_NOT_OWNER.code,
      );
    });
  });

  describe('confirm / cancel', () => {
    const lines = [
      { id: 'i1', material: cement, unit: bag, baseQuantity: 100 },
      { id: 'i2', material: cement, unit: kg, baseQuantity: 0.5 },
    ] as unknown as ImportFormItem[];

    beforeEach(() => {
      userRepository.findOneBy.mockResolvedValue(approver);
      manager.findOne.mockImplementation(async () => draft());
    });

    it.each([
      ['confirmImportForm', ImportFormStatus.Confirmed],
      ['cancelImportForm', ImportFormStatus.Cancelled],
    ] as const)('%s moves DRAFT to %s and records the approver', async (method, status) => {
      importFormRepository.findOne.mockResolvedValue(draft());

      const result = await service[method]('wh-slug', 'form-slug', { version: 2 }, actor([], 'u2'));

      expect(importFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'optimistic', version: 2 } }),
      );
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 'u2' });
      expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ status }));
      expect(importFormRepository.save).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        status,
        approverSlug: 'u2-slug',
        approverName: 'Tran Binh',
      });
    });

    it.each([ImportFormStatus.Confirmed, ImportFormStatus.Cancelled])(
      'cannot confirm a %s form again',
      async (status) => {
        importFormRepository.findOne.mockResolvedValue(draft({ status }));

        await expectError(
          service.confirmImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
          ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
        );
        expect(importFormRepository.save).not.toHaveBeenCalled();
      },
    );

    it('confirm adds every line baseQuantity to the warehouse stock in the same transaction', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: lines }));
      const u2 = actor([], 'u2');

      await service.confirmImportForm('wh-slug', 'form-slug', { version: 1 }, u2);

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(inventoryService.receive).toHaveBeenCalledWith(
        manager,
        'wh-1',
        [
          { materialId: 'mat-1', quantity: 100 },
          { materialId: 'mat-1', quantity: 0.5 },
        ],
        u2,
        'Import form PN-0001',
      );
      // Đổi trạng thái trước, cộng tồn sau — cùng 1 transaction.
      expect(manager.save.mock.invocationCallOrder[0]).toBeLessThan(
        inventoryService.receive.mock.invocationCallOrder[0],
      );
    });

    it('cancel does not touch the stock', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: lines }));

      await service.cancelImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2'));

      expect(inventoryService.receive).not.toHaveBeenCalled();
    });

    it('propagates an inventory error (material not in warehouse) so the transaction rolls back', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: lines }));
      inventoryService.receive.mockRejectedValue(
        new InventoryException(InventoryValidation.INVENTORY_NOT_FOUND),
      );

      await expectError(
        service.confirmImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
        InventoryValidation.INVENTORY_NOT_FOUND.code,
      );
    });

    // 2 request xác nhận đồng thời: cả hai qua optimistic check lúc đọc, request sau thấy bản đã khoá
    // không còn DRAFT ⇒ không cộng tồn lần 2.
    it('re-checks the status on the pessimistically locked row', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: lines }));
      manager.findOne.mockResolvedValue(draft({ status: ImportFormStatus.Confirmed, version: 2 }));

      await expectError(
        service.confirmImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
        ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
      );
      expect(manager.findOne).toHaveBeenCalledWith(ImportForm, {
        where: { id: 'form-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.save).not.toHaveBeenCalled();
      expect(inventoryService.receive).not.toHaveBeenCalled();
    });

    it('rejects with a version conflict when the form changed after it was read', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: lines }));
      manager.findOne.mockResolvedValue(draft({ version: 2 }));

      await expect(
        service.confirmImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
      ).rejects.toBeInstanceOf(OptimisticLockVersionMismatchError);
      expect(inventoryService.receive).not.toHaveBeenCalled();
    });

    it('throws ImportFormException when the form does not exist', async () => {
      importFormRepository.findOne.mockResolvedValue(null);

      await expect(
        service.cancelImportForm('wh-slug', 'nope', { version: 1 }, actor()),
      ).rejects.toBeInstanceOf(ImportFormException);
    });
  });
});
