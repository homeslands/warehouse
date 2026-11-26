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
import {
  AddImportFormItemRequestDto,
  CreateImportFormRequestDto,
  ImportFormSortBy,
} from './import-form.dto';
import { AuthorityCode } from 'src/authority/authority.constants';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { User } from 'src/user/user.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { Material } from 'src/material/material.entity';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierValidation } from 'src/supplier/supplier.validation';
import { ImportFormItem } from './import-form-item.entity';
import { CodeGenerateService } from 'src/code-generate/code-generate.service';
import { CodeType } from 'src/code-generate/code-generate.constants';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { S3Service } from 'src/file/s3/s3.service';
import { FileValidation } from 'src/file/file.validation';
import { insertMaterialSuppliers } from 'src/material/material-supplier.util';
import { MaterialBatchService } from 'src/material-batch/material-batch.service';

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
  const materialRepository = { findOne: jest.fn() };
  const supplierRepository = { findOne: jest.fn() };
  const inventoryRepository = { count: jest.fn(), findAndCount: jest.fn() };
  // `execute` chạy thẳng callback với `manager` giả — đủ để kiểm mọi lần ghi đều đi qua transaction.
  // Rollback thật do `TransactionManagerService` lo (xem `transaction-manager.service.spec.ts`).
  const lineNoQuery = { select: jest.fn(), where: jest.fn(), getRawOne: jest.fn() };
  const manager = {
    save: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => lineNoQuery),
  };
  const inventoryService = { receive: jest.fn() };
  const materialBatchService = { createFromImportItems: jest.fn() };
  const transactionManager = { execute: jest.fn() };
  const codeGenerateService = { generate: jest.fn(), generateMany: jest.fn() };
  const generatedCode = 'IM-WH-01-261012-000001';
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
    barcode: '2000100000019',
    baseUnit: kg,
    suppliers: [supplier],
    unitsCanHave: [
      { unit: kg, conversionRate: 1 },
      { unit: bag, conversionRate: 50 },
    ],
  } as unknown as Material;

  const warehouse = { id: 'wh-1', slug: 'wh-slug', code: 'WH-001', isActive: true } as Warehouse;
  const requester = { id: 'u1', slug: 'u1-slug', firstName: 'An', lastName: 'Nguyen' } as User;
  const approver = { id: 'u2', slug: 'u2-slug', firstName: 'Binh', lastName: 'Tran' } as User;

  const createDto: CreateImportFormRequestDto = { invoiceCode: 'HD-1', date: '2026-10-12' };

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
    codeGenerateService.generate.mockResolvedValue(generatedCode);
    codeGenerateService.generateMany.mockImplementation(async (_m, _t, _w, count: number) =>
      Array.from({ length: count }, (_, i) => `IT-WH-001-261012-${String(i + 1).padStart(6, '0')}`),
    );
    inventoryRepository.count.mockResolvedValue(1);
    lineNoQuery.select.mockReturnThis();
    lineNoQuery.where.mockReturnThis();
    lineNoQuery.getRawOne.mockResolvedValue({ max: null });
    manager.createQueryBuilder.mockReturnValue(lineNoQuery);
    manager.count.mockResolvedValue(0);

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
        { provide: CodeGenerateService, useValue: codeGenerateService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: S3Service, useValue: s3Service },
        { provide: MaterialBatchService, useValue: materialBatchService },
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
      userRepository.findOneBy.mockResolvedValue(requester);
    });

    it('creates an EMPTY DRAFT with requester snapshot and a generated code', async () => {
      const result = await service.createImportForm('wh-slug', createDto, actor());

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(codeGenerateService.generate).toHaveBeenCalledWith(
        manager,
        CodeType.ImportForm,
        warehouse,
      );
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: generatedCode,
          status: ImportFormStatus.Draft,
          requester,
          requesterName: 'Nguyen An',
          approver: null,
          approverName: null,
          warehouse,
          total: 0,
        }),
      );
      expect(result).toMatchObject({
        code: generatedCode,
        status: ImportFormStatus.Draft,
        requesterSlug: 'u1-slug',
        approverSlug: null,
        warehouseSlug: 'wh-slug',
        total: 0,
        items: [],
        groups: [],
      });
      expect(result).not.toHaveProperty('id');
      expect(codeGenerateService.generateMany).not.toHaveBeenCalled();
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
  });

  describe('addItems', () => {
    const full = () => actor([AuthorityCode.ImportFormUpdateDraft]);
    const scan: AddImportFormItemRequestDto = { barcode: '2000100000019', unitPrice: 10 };
    const savedLines = (): ImportFormItem[] => manager.save.mock.calls[0][0];

    beforeEach(() => {
      importFormRepository.findOne.mockResolvedValue(draft({ total: 0, items: [] }));
      manager.findOne.mockResolvedValue(draft({ total: 0 }));
      materialRepository.findOne.mockResolvedValue(cement);
    });

    it('scan: looks the material up by barcode and adds 1 line in the base unit with 1 code', async () => {
      const result = await service.addItems('wh-slug', 'form-slug', scan, full());

      expect(materialRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { barcode: '2000100000019' } }),
      );
      expect(codeGenerateService.generateMany).toHaveBeenCalledWith(
        manager,
        CodeType.Item,
        warehouse,
        1,
      );
      expect(savedLines()).toEqual([
        expect.objectContaining({
          code: 'IT-WH-001-261012-000001',
          lineNo: 1,
          material: cement,
          materialCode: 'XM-01',
          unit: kg,
          unitCode: 'KG',
          quantity: 1,
          conversionRate: 1,
          baseQuantity: 1,
          unitPrice: 10,
          amount: 10,
          supplierSlug: 'sup-slug',
          expiryDate: null,
          note: null,
        }),
      ]);
      expect(savedLines()[0]).toBeInstanceOf(ImportFormItem);
      expect(result.codes).toEqual(['IT-WH-001-261012-000001']);
    });

    it('manual: quantity N in a conversion unit => N lines, N codes, numbered after the last line', async () => {
      lineNoQuery.getRawOne.mockResolvedValue({ max: '7' });

      const result = await service.addItems(
        'wh-slug',
        'form-slug',
        { materialSlug: 'cement', unitSlug: 'bag', quantity: 3, unitPrice: 400, note: 'n' },
        full(),
      );

      expect(materialRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'cement' } }),
      );
      expect(savedLines()).toHaveLength(3);
      expect(savedLines().map((line) => [line.lineNo, line.code])).toEqual([
        [8, 'IT-WH-001-261012-000001'],
        [9, 'IT-WH-001-261012-000002'],
        [10, 'IT-WH-001-261012-000003'],
      ]);
      savedLines().forEach((line) =>
        expect(line).toMatchObject({
          unit: bag,
          quantity: 1,
          conversionRate: 50,
          baseQuantity: 50,
          amount: 400,
          note: 'n',
        }),
      );
      expect(result.codes).toHaveLength(3);
    });

    it('locks the form, writes lines + total in ONE transaction and always bumps the version', async () => {
      manager.findOne.mockResolvedValue(draft({ total: 100, version: 4 }));

      await service.addItems('wh-slug', 'form-slug', { ...scan, quantity: 2 }, full());

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(ImportForm, {
        where: { id: 'form-1' },
        lock: { mode: 'pessimistic_write' },
      });
      savedLines().forEach((line) => expect(line.importForm).toMatchObject({ id: 'form-1' }));
      expect(manager.update).toHaveBeenCalledWith(
        ImportForm,
        { id: 'form-1' },
        { total: 120, version: 5 },
      );
      // Khoá đầu phiếu trước, sinh mã sau, ghi dòng sau cùng.
      expect(manager.findOne.mock.invocationCallOrder[0]).toBeLessThan(
        codeGenerateService.generateMany.mock.invocationCallOrder[0],
      );
      expect(codeGenerateService.generateMany.mock.invocationCallOrder[0]).toBeLessThan(
        manager.save.mock.invocationCallOrder[0],
      );
    });

    // Đơn giá 0 không đổi `total` — version vẫn phải tăng, nếu không xác nhận bằng version cũ lọt qua.
    it('bumps the version even when the total does not change (unit price 0)', async () => {
      await service.addItems('wh-slug', 'form-slug', { ...scan, unitPrice: 0 }, full());

      expect(manager.update).toHaveBeenCalledWith(
        ImportForm,
        { id: 'form-1' },
        { total: 0, version: 2 },
      );
    });

    it('returns the reloaded form with lines grouped by material/unit/price', async () => {
      const line = (code: string, unit = kg, lineNo = 1) =>
        ({
          slug: code,
          code,
          lineNo,
          material: cement,
          materialCode: 'XM-01',
          materialName: 'Xi mang',
          unit,
          unitCode: unit.code,
          unitName: unit.name,
          quantity: 1,
          conversionRate: unit === bag ? 50 : 1,
          baseQuantity: unit === bag ? 50 : 1,
          unitPrice: 10,
          amount: 10,
        }) as unknown as ImportFormItem;
      importFormRepository.findOne
        .mockResolvedValueOnce(draft({ items: [] }))
        .mockResolvedValueOnce(
          draft({ items: [line('c1'), line('c2', bag, 2), line('c3', kg, 3)] }),
        );

      const result = await service.addItems('wh-slug', 'form-slug', scan, full());

      expect(result.form.items).toHaveLength(3);
      expect(result.form.groups).toEqual([
        expect.objectContaining({
          materialSlug: 'cement',
          unitSlug: 'kg',
          quantity: 2,
          baseQuantity: 2,
          amount: 20,
          codes: ['c1', 'c3'],
        }),
        expect.objectContaining({ unitSlug: 'bag', quantity: 1, baseQuantity: 50, codes: ['c2'] }),
      ]);
    });

    it.each([
      ['both barcode and materialSlug', { ...scan, materialSlug: 'cement' }],
      ['neither barcode nor materialSlug', { unitPrice: 1 }],
    ])('rejects %s', async (_label, dto) => {
      await expectError(
        service.addItems('wh-slug', 'form-slug', dto, full()),
        ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED.code,
      );
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });

    it('rejects an unknown barcode (no material is created)', async () => {
      materialRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.addItems('wh-slug', 'form-slug', scan, full()),
        ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND.code,
      );
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });

    it('rejects a material not assigned to the form warehouse', async () => {
      inventoryRepository.count.mockResolvedValue(0);

      await expectError(
        service.addItems('wh-slug', 'form-slug', scan, full()),
        ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE.code,
      );
      expect(inventoryRepository.count).toHaveBeenCalledWith({
        where: { warehouse: { id: 'wh-1' }, material: { id: 'mat-1' } },
      });
    });

    it('requires unitSlug when the material has no base unit', async () => {
      materialRepository.findOne.mockResolvedValue({ ...cement, baseUnit: null });

      await expectError(
        service.addItems('wh-slug', 'form-slug', scan, full()),
        ImportFormValidation.IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED.code,
      );
    });

    it('rejects a unit that is not attached to the material', async () => {
      await expectError(
        service.addItems('wh-slug', 'form-slug', { ...scan, unitSlug: 'litre' }, full()),
        ImportFormValidation.IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL.code,
      );
    });

    it.each([0, -1, Number.NaN])('rejects a dirty conversion rate %p from the DB', async (rate) => {
      materialRepository.findOne.mockResolvedValue({
        ...cement,
        unitsCanHave: [{ unit: kg, conversionRate: rate }],
      });

      await expectError(
        service.addItems('wh-slug', 'form-slug', scan, full()),
        ImportFormValidation.IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID.code,
      );
    });

    it('rejects an expiry date before the form date, accepts the same day', async () => {
      await expectError(
        service.addItems('wh-slug', 'form-slug', { ...scan, expiryDate: '2026-10-11' }, full()),
        ImportFormValidation.IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID.code,
      );

      await service.addItems('wh-slug', 'form-slug', { ...scan, expiryDate: '2026-10-12' }, full());
      expect(savedLines()[0].expiryDate).toBe('2026-10-12');
    });

    it('rejects going over the per-form line limit', async () => {
      manager.count.mockResolvedValue(1000);

      await expectError(
        service.addItems('wh-slug', 'form-slug', scan, full()),
        ImportFormValidation.IMPORT_FORM_ITEMS_TOO_MANY.code,
      );
      expect(codeGenerateService.generateMany).not.toHaveBeenCalled();
    });

    it('rejects a total that overflows DECIMAL(18,2)', async () => {
      manager.findOne.mockResolvedValue(draft({ total: 1e16 - 1 }));

      await expectError(
        service.addItems('wh-slug', 'form-slug', scan, full()),
        ImportFormValidation.IMPORT_FORM_TOTAL_INVALID.code,
      );
    });

    // Phiếu đã bị xác nhận/huỷ giữa lúc đọc và lúc khoá.
    it('re-checks DRAFT on the locked row', async () => {
      manager.findOne.mockResolvedValue(draft({ status: ImportFormStatus.Confirmed }));

      await expectError(
        service.addItems('wh-slug', 'form-slug', scan, full()),
        ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects a non-DRAFT form before opening a transaction', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ status: ImportFormStatus.Cancelled }));

      await expectError(
        service.addItems('wh-slug', 'form-slug', scan, full()),
        ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
      );
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });

    describe('supplier', () => {
      const supplierB = {
        id: 'sup-2',
        slug: 'sup-b',
        code: 'NCC-02',
        name: 'Supplier B',
        taxCode: '0109999999',
        address: 'HCMC',
      } as Supplier;

      it('writes null supplier when the material has several suppliers and none is named', async () => {
        materialRepository.findOne.mockResolvedValue({
          ...cement,
          suppliers: [supplier, supplierB],
        });

        await service.addItems('wh-slug', 'form-slug', scan, full());

        expect(savedLines()[0]).toMatchObject({ supplierSlug: null, supplierCode: null });
        expect(insertMaterialSuppliers).toHaveBeenCalledWith(manager, []);
      });

      it('auto-attaches a supplier not yet attached to the material, in the SAME transaction', async () => {
        supplierRepository.findOne.mockResolvedValue(supplierB);

        await service.addItems('wh-slug', 'form-slug', { ...scan, supplierSlug: 'sup-b' }, full());

        expect(insertMaterialSuppliers).toHaveBeenCalledWith(manager, [
          { materialId: 'mat-1', supplierId: 'sup-2' },
        ]);
        expect(savedLines()[0]).toMatchObject({ supplierSlug: 'sup-b', supplierCode: 'NCC-02' });
      });

      it('rejects an unknown supplierSlug before opening a transaction', async () => {
        supplierRepository.findOne.mockResolvedValue(null);

        await expectError(
          service.addItems('wh-slug', 'form-slug', { ...scan, supplierSlug: 'missing' }, full()),
          SupplierValidation.SUPPLIER_NOT_FOUND.code,
        );
        expect(transactionManager.execute).not.toHaveBeenCalled();
      });
    });

    it("rejects _OWN on someone else's form", async () => {
      await expectError(
        service.addItems(
          'wh-slug',
          'form-slug',
          scan,
          actor([AuthorityCode.ImportFormUpdateDraftOwn], 'someone-else'),
        ),
        ImportFormValidation.IMPORT_FORM_NOT_OWNER.code,
      );
    });

    it('returns 403 without the update-draft authorities', async () => {
      await expect(
        service.addItems('wh-slug', 'form-slug', scan, actor([AuthorityCode.ImportFormCreate])),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('removeItem', () => {
    const full = () => actor([AuthorityCode.ImportFormUpdateDraft]);

    beforeEach(() => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: [] }));
    });

    it('deletes the line under the form lock, lowers the total and bumps the version', async () => {
      manager.findOne
        .mockResolvedValueOnce(draft({ total: 100, version: 3 }))
        .mockResolvedValueOnce({ id: 'item-1', slug: 'item-slug', amount: 40 });

      await service.removeItem('wh-slug', 'form-slug', 'item-slug', full());

      expect(manager.findOne).toHaveBeenNthCalledWith(2, ImportFormItem, {
        where: { slug: 'item-slug', importForm: expect.anything() },
      });
      expect(manager.delete).toHaveBeenCalledWith(ImportFormItem, 'item-1');
      expect(manager.update).toHaveBeenCalledWith(
        ImportForm,
        { id: 'form-1' },
        { total: 60, version: 4 },
      );
    });

    it('returns IMPORT_FORM_ITEM_NOT_FOUND for a line of another form / already removed', async () => {
      manager.findOne.mockResolvedValueOnce(draft()).mockResolvedValueOnce(null);

      await expectError(
        service.removeItem('wh-slug', 'form-slug', 'nope', full()),
        ImportFormValidation.IMPORT_FORM_ITEM_NOT_FOUND.code,
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('rejects a CONFIRMED form', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ status: ImportFormStatus.Confirmed }));

      await expectError(
        service.removeItem('wh-slug', 'form-slug', 'item-slug', full()),
        ImportFormValidation.IMPORT_FORM_NOT_DRAFT.code,
      );
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
        code: 'XM_',
      } as never);

      const [options] = inventoryRepository.findAndCount.mock.calls[0];
      expect(options.where.warehouse).toEqual({ id: 'wh-1' });
      expect(options.where.material.name.value).toBe('%Xi%');
      // Tiền tố, `_` được escape để không thành ký tự đại diện của LIKE.
      expect(options.where.material.code.value).toBe('XM\\_%');
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

    it('includes effectiveMaximumInventory (warehouse override ?? material default) only when > 0', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      inventoryRepository.findAndCount.mockResolvedValue([
        [
          {
            quantity: 10,
            maximumInventory: 80,
            material: {
              ...cement,
              slug: 'm-override',
              code: 'M-1',
              baseUnit: kg,
              maximumInventory: 100,
            },
          },
          {
            quantity: 10,
            maximumInventory: null,
            material: {
              ...cement,
              slug: 'm-default',
              code: 'M-2',
              baseUnit: kg,
              maximumInventory: 100,
            },
          },
          {
            quantity: 10,
            maximumInventory: null,
            material: {
              ...cement,
              slug: 'm-unset',
              code: 'M-3',
              baseUnit: kg,
              maximumInventory: 0,
            },
          },
          {
            quantity: 10,
            maximumInventory: 0,
            material: {
              ...cement,
              slug: 'm-override-unlimited',
              code: 'M-4',
              baseUnit: kg,
              maximumInventory: 100,
            },
          },
        ],
        4,
      ]);

      const result = await service.findAvailableMaterials('wh-slug', {
        page: 1,
        size: 10,
      } as never);

      expect(result.items[0].effectiveMaximumInventory).toBe(80);
      expect(result.items[1].effectiveMaximumInventory).toBe(100);
      expect(result.items[2]).not.toHaveProperty('effectiveMaximumInventory');
      expect(result.items[3]).not.toHaveProperty('effectiveMaximumInventory');
    });

    it('returns WAREHOUSE_NOT_FOUND for an unknown warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.findAvailableMaterials('nope', { page: 1, size: 10 } as never),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });

    it('escapes LIKE wildcards in the substring name filter', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      inventoryRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAvailableMaterials('wh-slug', {
        page: 1,
        size: 10,
        name: String.raw`a%_\b`,
      } as never);

      const [options] = inventoryRepository.findAndCount.mock.calls[0];
      expect(options.where.material.name.type).toBe('like');
      expect(options.where.material.name.value).toBe(String.raw`%a\%\_\\b%`);
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

    it('filters code by prefix, escaping LIKE wildcards', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('wh-slug', { page: 1, size: 10, code: 'PN_2026' });

      expect(importFormRepository.findAndCount.mock.calls[0][0].where.code).toMatchObject({
        _type: 'like',
        _value: 'PN\\_2026%',
      });
    });

    it('filters invoiceCode / purchaseOrder by prefix and requester / approver by slug', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('wh-slug', {
        page: 1,
        size: 10,
        invoiceCode: 'HD_001',
        purchaseOrder: 'PO-2026',
        requesterSlug: 'user-req',
        approverSlug: 'user-app',
      });

      const { where } = importFormRepository.findAndCount.mock.calls[0][0];
      expect(where.invoiceCode).toMatchObject({ _type: 'like', _value: 'HD\\_001%' });
      expect(where.purchaseOrder).toMatchObject({ _type: 'like', _value: 'PO-2026%' });
      expect(where.requester).toEqual({ slug: 'user-req' });
      expect(where.approver).toEqual({ slug: 'user-app' });
    });

    it('does not add the new filters when they are omitted', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);
      importFormRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('wh-slug', { page: 1, size: 10 });

      const { where } = importFormRepository.findAndCount.mock.calls[0][0];
      expect(where).not.toHaveProperty('invoiceCode');
      expect(where).not.toHaveProperty('purchaseOrder');
      expect(where).not.toHaveProperty('requester');
      expect(where).not.toHaveProperty('approver');
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

    beforeEach(() => {
      manager.findOne.mockImplementation(async () => draft());
    });

    it('loads the form with an optimistic lock on the sent version', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ version: 3 }));
      manager.findOne.mockResolvedValue(draft({ version: 3 }));

      await service.updateImportForm('wh-slug', 'form-slug', { version: 3 }, full());

      expect(importFormRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'optimistic', version: 3 } }),
      );
    });

    // Ghi lên bản đã khoá: `total` mới nhất (vừa đổi bởi thêm/gỡ dòng) không bị ghi đè bằng bản đọc cũ.
    it('saves the locked row, keeping fields that were not sent (incl. its fresh total)', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ total: 1000 }));
      manager.findOne.mockResolvedValue(draft({ total: 1234 }));

      await service.updateImportForm(
        'wh-slug',
        'form-slug',
        { note: 'new note', version: 1 },
        full(),
      );

      expect(manager.findOne).toHaveBeenCalledWith(ImportForm, {
        where: { id: 'form-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'new note',
          code: 'PN-0001',
          invoiceCode: 'HD-1',
          total: 1234,
        }),
      );
      expect(manager.save.mock.calls[0][0]).not.toHaveProperty('items');
    });

    it('rejects with a version conflict when lines changed after the read', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ version: 1 }));
      manager.findOne.mockResolvedValue(draft({ version: 2 }));

      await expect(
        service.updateImportForm('wh-slug', 'form-slug', { note: 'x', version: 1 }, full()),
      ).rejects.toBeInstanceOf(OptimisticLockVersionMismatchError);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rejects moving the form date after an existing line expiry', async () => {
      const items = [{ id: 'i1', expiryDate: '2026-10-20' }] as ImportFormItem[];
      importFormRepository.findOne.mockResolvedValue(draft({ items }));

      await expectError(
        service.updateImportForm(
          'wh-slug',
          'form-slug',
          { version: 1, date: '2026-10-21' },
          full(),
        ),
        ImportFormValidation.IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID.code,
      );
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });

    // Automapper không kế thừa map Create -> Update: field nào thiếu `forMember` là PATCH âm thầm bỏ.
    it('applies every editable field that is sent', async () => {
      importFormRepository.findOne.mockResolvedValue(draft());
      const patch = {
        purchaseOrder: 'PO-9',
        invoiceCode: 'HD-9',
        date: '2026-11-01',
        file: 'import-forms/x.pdf',
        note: 'n',
      };

      await service.updateImportForm('wh-slug', 'form-slug', { ...patch, version: 1 }, full());

      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ ...patch, code: 'PN-0001' }),
      );
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

    // #184: đuôi phải khớp mimetype — `x.html` khai `application/pdf` bị chặn với mã cũ, không lên S3.
    it.each([
      ['x.html', 'application/pdf'],
      ['x.png', 'application/pdf'],
    ])('rejects %s declared as %s without touching S3', async (originalname, mimetype) => {
      await expectError(
        service.uploadFile(
          { originalname, mimetype } as Express.Multer.File,
          actor([AuthorityCode.ImportFormCreate]),
        ),
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
      importFormRepository.findOne.mockResolvedValue(draft({ items: lines }));

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

    it('cannot confirm a form without lines (cancel is allowed)', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: [] }));

      await expectError(
        service.confirmImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
        ImportFormValidation.IMPORT_FORM_ITEMS_IS_REQUIRED.code,
      );
      expect(transactionManager.execute).not.toHaveBeenCalled();
      await expect(
        service.cancelImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2')),
      ).resolves.toMatchObject({ status: ImportFormStatus.Cancelled });
    });

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

    it('confirm creates 1 batch per line after adding the stock, in the same transaction', async () => {
      const form = draft({ items: lines });
      importFormRepository.findOne.mockResolvedValue(form);

      await service.confirmImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2'));

      expect(materialBatchService.createFromImportItems).toHaveBeenCalledWith(manager, form, lines);
      expect(inventoryService.receive.mock.invocationCallOrder[0]).toBeLessThan(
        materialBatchService.createFromImportItems.mock.invocationCallOrder[0],
      );
    });

    it('cancel does not touch the stock nor create batches', async () => {
      importFormRepository.findOne.mockResolvedValue(draft({ items: lines }));

      await service.cancelImportForm('wh-slug', 'form-slug', { version: 1 }, actor([], 'u2'));

      expect(inventoryService.receive).not.toHaveBeenCalled();
      expect(materialBatchService.createFromImportItems).not.toHaveBeenCalled();
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
