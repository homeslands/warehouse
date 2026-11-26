import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { InventoryService } from './inventory.service';
import { InventoryProfile } from './inventory.mapper';
import { UnitProfile } from 'src/unit/unit.mapper';
import { MaterialProfile } from 'src/material/material.mapper';
import { Inventory } from './inventory.entity';
import { InventoryHistory } from './inventory-history.entity';
import { InventoryHistoryAction } from './inventory.constants';
import { InventoryException } from './inventory.exception';
import { InventoryValidation } from './inventory.validation';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { Material } from 'src/material/material.entity';
import { MaterialService } from 'src/material/material.service';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierException } from 'src/supplier/supplier.exception';
import { SupplierValidation } from 'src/supplier/supplier.validation';
import { insertMaterialSuppliers } from 'src/material/material-supplier.util';
import { CodeGenerateService } from 'src/code-generate/code-generate.service';
import { CodeType } from 'src/code-generate/code-generate.constants';

// Bảng join `material_supplier_tbl` ghi qua `material-supplier.util.ts` (có spec riêng).
jest.mock('src/material/material-supplier.util');

const warehouse = (overrides: Partial<Warehouse> = {}): Warehouse =>
  ({ id: 'wh-id-1', slug: 'wh-slug-1', isActive: true, ...overrides }) as Warehouse;

const material = (overrides: Partial<Material> = {}): Material =>
  ({
    id: 'mat-id-1',
    slug: 'mat-slug-1',
    code: 'MAT-001',
    name: 'Găng tay',
    type: { id: 'type-id-1', slug: 'type-slug-1', name: 'Tiêu hao' },
    baseUnit: { id: 'unit-id-1', slug: 'unit-slug-1', code: 'DOI', name: 'Đôi' },
    unitsCanHave: [
      {
        materialId: 'mat-id-1',
        unitId: 'unit-id-3',
        unit: { id: 'unit-id-3', slug: 'unit-slug-3', code: 'THUNG', name: 'Thùng' },
        conversionRate: 100,
      },
      {
        materialId: 'mat-id-1',
        unitId: 'unit-id-2',
        unit: { id: 'unit-id-2', slug: 'unit-slug-2', code: 'HOP', name: 'Hộp' },
        conversionRate: 10,
      },
      {
        materialId: 'mat-id-1',
        unitId: 'unit-id-1',
        unit: { id: 'unit-id-1', slug: 'unit-slug-1', code: 'DOI', name: 'Đôi' },
        conversionRate: 1,
      },
      // Đơn vị đã xoá mềm ⇒ relation null, bị bỏ khỏi response.
      { materialId: 'mat-id-1', unitId: 'unit-id-9', unit: null, conversionRate: 5 },
    ],
    minimumInventory: 10,
    maximumInventory: 100,
    ...overrides,
  }) as Material;

const row = (overrides: Partial<Inventory> = {}): Inventory =>
  ({
    id: 'wm-id-1',
    slug: 'wm-slug-1',
    warehouse: warehouse(),
    material: material(),
    quantity: 20,
    reservedQuantity: 0,
    minimumInventory: null,
    maximumInventory: null,
    ...overrides,
  }) as Inventory;

const expectError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(InventoryException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('InventoryService', () => {
  let service: InventoryService;
  const inventoryRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const warehouseRepository = { findOneBy: jest.fn() };
  const supplierRepository = { findOneBy: jest.fn() };
  const historyRepository = { findAndCount: jest.fn() };
  const materialService = { findEntityBySlug: jest.fn(), createMaterialIn: jest.fn() };
  const actor = { userId: 'user-id-1', scope: [] };

  /** Repository lấy qua `manager` bên trong transaction — tách khỏi repository inject ở ngoài. */
  const txInventoryRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((data) => data),
    update: jest.fn(),
    softRemove: jest.fn(),
  };
  const txHistoryRepository = { create: jest.fn((data) => data), save: jest.fn((data) => data) };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === InventoryHistory ? txHistoryRepository : txInventoryRepository,
    ),
  };
  const transactionManager = { execute: jest.fn((onSave) => onSave(manager)) };
  const codeGenerateService = { generate: jest.fn() };

  /** Dòng lịch sử duy nhất đã ghi trong lần gọi vừa rồi. */
  const writtenHistory = () => {
    expect(txHistoryRepository.save).toHaveBeenCalledTimes(1);
    return txHistoryRepository.save.mock.calls[0][0];
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        InventoryProfile,
        UnitProfile,
        MaterialProfile,
        {
          provide: getRepositoryToken(Inventory),
          useValue: inventoryRepository,
        },
        { provide: getRepositoryToken(InventoryHistory), useValue: historyRepository },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepository },
        { provide: TransactionManagerService, useValue: transactionManager },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
        { provide: MaterialService, useValue: materialService },
        { provide: CodeGenerateService, useValue: codeGenerateService },
      ],
    }).compile();
    await module.init();

    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMaterialInWarehouse', () => {
    const materialDto = { code: 'MAT-001', name: 'Găng tay', typeSlug: 't', baseUnitSlug: 'u' };
    const create = (overrides: Record<string, unknown> = {}) =>
      service.createMaterialInWarehouse(
        'wh-slug-1',
        { material: materialDto, ...overrides } as never,
        actor,
      );

    beforeEach(() => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.createMaterialIn.mockResolvedValue(material());
      inventoryRepository.create.mockImplementation((data) => ({ id: 'wm-id-1', ...data }));
      txInventoryRepository.save.mockImplementation((data) => data);
      // `mutate()` đọc lại bản ghi vừa insert trong cùng transaction để khoá dòng và ghi lịch sử.
      txInventoryRepository.findOne.mockImplementation(async () => {
        const calls = txInventoryRepository.save.mock.calls;
        return {
          ...(calls[calls.length - 1]?.[0] ?? row({ quantity: 0 })),
          id: 'wm-id-1',
          warehouse: undefined,
        };
      });
    });

    it('creates the material, the inventory row via mutate() and an ASSIGN history in ONE transaction', async () => {
      const result = await create({ quantity: 5, minimumInventory: 20 });

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      // Vật tư được tạo bằng `manager` của transaction này, không tự mở transaction riêng.
      expect(materialService.createMaterialIn).toHaveBeenCalledWith(manager, materialDto);
      expect(txInventoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 0,
          reservedQuantity: 0,
          minimumInventory: 20,
          reassignedAt: null,
        }),
      );
      expect(txInventoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'wm-id-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(txInventoryRepository.update).toHaveBeenCalledWith(
        { id: 'wm-id-1' },
        { quantity: 5, reservedQuantity: 0 },
      );
      expect(writtenHistory()).toMatchObject({
        action: InventoryHistoryAction.Assign,
        quantityDelta: 5,
        quantityBefore: 0,
        quantityAfter: 5,
      });
      expect(result).toMatchObject({
        materialCode: 'MAT-001',
        warehouseSlug: 'wh-slug-1',
        quantity: 5,
        effectiveMinimumInventory: 20,
        reassignedAt: null,
      });
    });

    it('keeps a client-sent code and does not generate one', async () => {
      await create();

      expect(codeGenerateService.generate).not.toHaveBeenCalled();
      expect(materialService.createMaterialIn).toHaveBeenCalledWith(manager, materialDto);
    });

    it('generates the material code inside the same transaction when code is omitted', async () => {
      const wh = warehouse({ code: 'WH-HN-01' });
      warehouseRepository.findOneBy.mockResolvedValue(wh);
      codeGenerateService.generate.mockResolvedValue('IT-WH-HN-01-261123-000001');
      const withoutCode: Record<string, unknown> = { ...materialDto };
      delete withoutCode.code;

      await service.createMaterialInWarehouse(
        'wh-slug-1',
        { material: withoutCode } as never,
        actor,
      );

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(codeGenerateService.generate).toHaveBeenCalledWith(manager, CodeType.Item, wh);
      expect(materialService.createMaterialIn).toHaveBeenCalledWith(manager, {
        ...withoutCode,
        code: 'IT-WH-HN-01-261123-000001',
      });
      expect(codeGenerateService.generate.mock.invocationCallOrder[0]).toBeLessThan(
        materialService.createMaterialIn.mock.invocationCallOrder[0],
      );
    });

    it('rejects an inactive warehouse before creating anything', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse({ isActive: false }));

      await expectError(create(), InventoryValidation.INVENTORY_WAREHOUSE_INACTIVE.code);
      expect(transactionManager.execute).not.toHaveBeenCalled();
      expect(materialService.createMaterialIn).not.toHaveBeenCalled();
    });

    // Lỗi sau khi đã tạo vật tư phải ném ra trong transaction ⇒ rollback cả vật tư vừa tạo.
    it('throws inside the transaction when the warehouse override conflicts with the material default', async () => {
      await expectError(
        create({ minimumInventory: 500 }),
        InventoryValidation.INVENTORY_RANGE_INVALID.code,
      );
      expect(materialService.createMaterialIn).toHaveBeenCalled();
      expect(txInventoryRepository.save).not.toHaveBeenCalled();
    });

    it('does not touch the supplier join table when supplierSlug is omitted', async () => {
      await create();

      expect(supplierRepository.findOneBy).not.toHaveBeenCalled();
      expect(insertMaterialSuppliers).not.toHaveBeenCalled();
    });

    it('attaches the new material to the supplier inside the SAME transaction', async () => {
      supplierRepository.findOneBy.mockResolvedValue({ id: 'sup-id-1', slug: 'sup-slug-1' });

      await create({ supplierSlug: 'sup-slug-1' });

      expect(supplierRepository.findOneBy).toHaveBeenCalledWith({ slug: 'sup-slug-1' });
      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(insertMaterialSuppliers).toHaveBeenCalledWith(manager, [
        { materialId: 'mat-id-1', supplierId: 'sup-id-1' },
      ]);
      // Gắn sau khi vật tư đã được tạo (cần `material.id`).
      expect(materialService.createMaterialIn.mock.invocationCallOrder[0]).toBeLessThan(
        jest.mocked(insertMaterialSuppliers).mock.invocationCallOrder[0],
      );
    });

    it('rejects an unknown supplier before creating anything', async () => {
      supplierRepository.findOneBy.mockResolvedValue(null);

      const promise = create({ supplierSlug: 'missing' });
      await expect(promise).rejects.toBeInstanceOf(SupplierException);
      await expect(promise).rejects.toMatchObject({
        code: SupplierValidation.SUPPLIER_NOT_FOUND.code,
      });
      expect(transactionManager.execute).not.toHaveBeenCalled();
      expect(materialService.createMaterialIn).not.toHaveBeenCalled();
    });
  });

  describe('assignMaterial', () => {
    const assign = (overrides: Record<string, unknown> = {}) =>
      service.assignMaterial('wh-slug-1', { materialSlug: 'mat-slug-1', ...overrides }, actor);

    it('creates the row via mutate() and falls back to the material thresholds when no override is given', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      txInventoryRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(row({ id: 'wm-id-1', quantity: 0, warehouse: undefined }));
      inventoryRepository.create.mockImplementation((data) => ({ id: 'wm-id-1', ...data }));
      txInventoryRepository.save.mockImplementation((data) => data);
      inventoryRepository.findOne.mockResolvedValueOnce(row({ quantity: 5, reassignedAt: null }));

      const result = await assign({ quantity: 5 });

      expect(txInventoryRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { warehouse: { id: 'wh-id-1' }, material: { id: 'mat-id-1' } },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      expect(inventoryRepository.findOne).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { warehouse: { slug: 'wh-slug-1' }, material: { slug: 'mat-slug-1' } },
          relations: expect.objectContaining({
            material: expect.objectContaining({ unitsCanHave: { unit: true } }),
          }),
        }),
      );
      expect(result.units.map((unit) => unit.unitCode)).toEqual(['DOI', 'HOP', 'THUNG']);

      expect(result).toMatchObject({
        quantity: 5,
        reservedQuantity: 0,
        availableQuantity: 5,
        minimumInventory: null,
        maximumInventory: null,
        effectiveMinimumInventory: 10,
        effectiveMaximumInventory: 100,
        isBelowMinimum: true,
        isAboveMaximum: false,
        reassignedAt: null,
        materialCode: 'MAT-001',
        warehouseSlug: 'wh-slug-1',
      });
    });

    it('writes initial quantity through mutate() and records an ASSIGN history entry in the same transaction', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      txInventoryRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(row({ id: 'wm-id-1', quantity: 0, warehouse: undefined }));
      inventoryRepository.create.mockImplementation((data) => ({ id: 'wm-id-1', ...data }));
      txInventoryRepository.save.mockImplementation((data) => data);
      inventoryRepository.findOne.mockResolvedValueOnce(row({ quantity: 5 }));

      await assign({ quantity: 5 });

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(txInventoryRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 0, reservedQuantity: 0, reassignedAt: null }),
      );
      expect(txInventoryRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: 'wm-id-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(txInventoryRepository.update).toHaveBeenCalledWith(
        { id: 'wm-id-1' },
        { quantity: 5, reservedQuantity: 0 },
      );
      expect(writtenHistory()).toMatchObject({
        inventory: { id: 'wm-id-1' },
        action: InventoryHistoryAction.Assign,
        quantityDelta: 5,
        quantityBefore: 0,
        quantityAfter: 5,
        reservedBefore: 0,
        reservedAfter: 0,
        changedBy: { id: 'user-id-1' },
      });
    });

    it('refuses to manage materials of an inactive warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse({ isActive: false }));

      await expectError(assign(), InventoryValidation.INVENTORY_WAREHOUSE_INACTIVE.code);
    });

    it('rejects a material currently active in the warehouse under the transaction lock', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      txInventoryRepository.findOne.mockResolvedValue(row({ deletedAt: null }));

      await expectError(assign(), InventoryValidation.INVENTORY_DOES_EXIST.code);
      expect(txInventoryRepository.update).not.toHaveBeenCalled();
      expect(txInventoryRepository.save).not.toHaveBeenCalled();
    });

    // `UQ_inventory(warehouse, material)` tính cả row xoá mềm: gán lại phải khoá và khôi phục
    // đúng row cũ, lưu `reassignedAt`, đi qua `mutate()` và ghi lịch sử `REASSIGN`.
    it('recovers a previously removed row with reassignedAt via mutate() and writes a REASSIGN history', async () => {
      const reassignedAt = new Date('2026-11-20T02:00:00.000Z');
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      txInventoryRepository.findOne
        .mockResolvedValueOnce(
          row({
            id: 'wm-id-old',
            deletedAt: new Date('2026-11-18T00:00:00.000Z'),
            quantity: 0,
            minimumInventory: 50,
            maximumInventory: 90,
          }),
        )
        .mockResolvedValueOnce(
          row({ id: 'wm-id-old', quantity: 0, warehouse: undefined, reassignedAt }),
        );
      inventoryRepository.findOne.mockResolvedValueOnce(
        row({ id: 'wm-id-old', quantity: 7, reassignedAt }),
      );

      const result = await assign({ quantity: 7 });

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(txInventoryRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { warehouse: { id: 'wh-id-1' }, material: { id: 'mat-id-1' } },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      expect(txInventoryRepository.update).toHaveBeenNthCalledWith(
        1,
        { id: 'wm-id-old' },
        {
          quantity: 0,
          reservedQuantity: 0,
          minimumInventory: null,
          maximumInventory: null,
          reassignedAt: expect.any(Date),
          deletedAt: null,
        },
      );
      expect(txInventoryRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: 'wm-id-old' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(txInventoryRepository.update).toHaveBeenNthCalledWith(
        2,
        { id: 'wm-id-old' },
        { quantity: 7, reservedQuantity: 0 },
      );
      expect(writtenHistory()).toMatchObject({
        inventory: { id: 'wm-id-old' },
        action: InventoryHistoryAction.Reassign,
        quantityDelta: 7,
        quantityBefore: 0,
        quantityAfter: 7,
        reservedBefore: 0,
        reservedAfter: 0,
        changedBy: { id: 'user-id-1' },
      });
      expect(result).toMatchObject({
        quantity: 7,
        effectiveMinimumInventory: 10,
        effectiveMaximumInventory: 100,
        reassignedAt: reassignedAt.toString(),
      });
    });

    it('rejects recovering a soft-deleted row when the new override conflicts with the material default', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      txInventoryRepository.findOne.mockResolvedValue(row({ deletedAt: new Date() }));

      await expectError(
        assign({ minimumInventory: 500 }),
        InventoryValidation.INVENTORY_RANGE_INVALID.code,
      );
      expect(txInventoryRepository.update).not.toHaveBeenCalled();
    });

    it('throws WAREHOUSE_NOT_FOUND when the warehouse slug is unknown', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expect(assign()).rejects.toBeInstanceOf(WarehouseException);
      await expect(assign()).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
    });

    // Override 1 vế phải so với vế EFFECTIVE còn lại, trừ khi max = 0 (không giới hạn).
    it('rejects an override that conflicts with a positive material default on the other side', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      txInventoryRepository.findOne.mockResolvedValue(null);

      await expectError(
        assign({ minimumInventory: 500 }),
        InventoryValidation.INVENTORY_RANGE_INVALID.code,
      );
      expect(txInventoryRepository.save).not.toHaveBeenCalled();
    });

    it('accepts minimumInventory > 0 when effective maximumInventory is 0 (unlimited)', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material({ maximumInventory: 0 }));
      txInventoryRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(row({ id: 'wm-id-1', quantity: 0, warehouse: undefined }));
      inventoryRepository.create.mockImplementation((data) => ({ id: 'wm-id-1', ...data }));
      txInventoryRepository.save.mockImplementation((data) => data);
      inventoryRepository.findOne.mockResolvedValueOnce(
        row({
          quantity: 80,
          minimumInventory: 50,
          maximumInventory: null,
          material: material({ maximumInventory: 0 }),
        }),
      );

      const result = await assign({ quantity: 80, minimumInventory: 50 });

      expect(result).toMatchObject({
        effectiveMinimumInventory: 50,
        effectiveMaximumInventory: 0,
        isAboveMaximum: false,
      });
    });
  });

  describe('updateThresholds', () => {
    it('distinguishes "field not sent" from "null" when clearing an override', async () => {
      inventoryRepository.findOne.mockResolvedValue(
        row({ minimumInventory: 30, maximumInventory: 80 }),
      );
      inventoryRepository.save.mockImplementation((data) => data);

      // Chỉ gửi `minimumInventory: null` -> vế min quay về mặc định (10), vế max giữ override 80.
      const result = await service.updateThresholds('wh-slug-1', 'mat-slug-1', {
        minimumInventory: null,
      });

      expect(result).toMatchObject({
        minimumInventory: null,
        maximumInventory: 80,
        effectiveMinimumInventory: 10,
        effectiveMaximumInventory: 80,
      });
    });

    it('rejects an update that would make a positive max lower than min', async () => {
      inventoryRepository.findOne.mockResolvedValue(row());

      await expectError(
        service.updateThresholds('wh-slug-1', 'mat-slug-1', { maximumInventory: 5 }),
        InventoryValidation.INVENTORY_RANGE_INVALID.code,
      );
    });

    it('treats effective maximum 0 (from material or warehouse override) as unlimited', async () => {
      inventoryRepository.findOne.mockResolvedValue(row({ quantity: 500 }));
      inventoryRepository.save.mockImplementation((data) => data);

      const result = await service.updateThresholds('wh-slug-1', 'mat-slug-1', {
        minimumInventory: 50,
        maximumInventory: 0,
      });

      expect(result).toMatchObject({
        effectiveMinimumInventory: 50,
        effectiveMaximumInventory: 0,
        isAboveMaximum: false,
      });
    });
  });

  describe('adjustQuantity', () => {
    const adjust = (dto: { delta: number; note?: string }) =>
      service.adjustQuantity('wh-slug-1', 'mat-slug-1', dto, actor);

    beforeEach(() => {
      inventoryRepository.findOne.mockResolvedValue(row());
    });

    it('locks the row with pessimistic_write (without relations) before reading the quantity', async () => {
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 20, warehouse: undefined }));

      await adjust({ delta: -5 });

      expect(txInventoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'wm-id-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(txInventoryRepository.update).toHaveBeenCalledWith(
        { id: 'wm-id-1' },
        { quantity: 15, reservedQuantity: 0 },
      );
    });

    it('records one ADJUST history entry with the before/after snapshot and the note', async () => {
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 20, reservedQuantity: 4 }));

      await adjust({ delta: 5, note: 'Nhập bù' });

      expect(writtenHistory()).toMatchObject({
        action: InventoryHistoryAction.Adjust,
        quantityDelta: 5,
        quantityBefore: 20,
        quantityAfter: 25,
        reservedDelta: 0,
        reservedBefore: 4,
        reservedAfter: 4,
        note: 'Nhập bù',
        changedBy: { id: 'user-id-1' },
      });
    });

    it('rejects an adjustment that would make the stock negative', async () => {
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 3 }));

      await expectError(
        adjust({ delta: -10 }),
        InventoryValidation.INVENTORY_QUANTITY_NEGATIVE.code,
      );
      expect(txInventoryRepository.update).not.toHaveBeenCalled();
      expect(txHistoryRepository.save).not.toHaveBeenCalled();
    });

    it('rejects an adjustment that would drop the stock below the reserved quantity', async () => {
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 10, reservedQuantity: 5 }));

      await expectError(
        adjust({ delta: -6 }),
        InventoryValidation.INVENTORY_QUANTITY_BELOW_RESERVED.code,
      );
      expect(txInventoryRepository.update).not.toHaveBeenCalled();
    });

    // Tồn là DECIMAL(18,6) từ migration `1783728000021`: nhập theo đơn vị nhỏ hơn đơn vị cơ sở cho
    // ra delta lẻ, `Math.trunc` cũ sẽ nuốt sạch phần thập phân (0.5 -> 0). Cộng số thực cũng phải
    // làm tròn về 6 chữ số, nếu không 0.1 + 0.2 ghi xuống thành 0.30000000000000004.
    it('giữ nguyên phần thập phân của delta và làm tròn kết quả về scale 6', async () => {
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 0.1 }));

      await adjust({ delta: 0.2 });

      expect(txInventoryRepository.update.mock.calls[0][1]).toEqual({
        quantity: 0.3,
        reservedQuantity: 0,
      });
    });

    it('reports a missing assignment when the row disappears before the lock is taken', async () => {
      txInventoryRepository.findOne.mockResolvedValue(null);

      await expectError(adjust({ delta: 1 }), InventoryValidation.INVENTORY_NOT_FOUND.code);
    });

    // `@IsNotEmpty()` của class-validator KHÔNG coi 0 là empty, nên rào này phải nằm ở service.
    it('rejects a zero delta before touching the database', async () => {
      await expectError(adjust({ delta: 0 }), InventoryValidation.INVENTORY_DELTA_INVALID.code);
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });
  });

  describe('receive (import form confirmed)', () => {
    const receive = (lines: { materialId: string; quantity: number }[]) =>
      service.receive(manager as never, 'wh-id-1', lines, actor, 'Import form PN-1');

    it('sums lines per material, locks each row and records one IMPORT history per material', async () => {
      txInventoryRepository.find.mockResolvedValue([row()]);
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 20, warehouse: undefined }));

      await receive([
        { materialId: 'mat-id-1', quantity: 100 },
        { materialId: 'mat-id-1', quantity: 0.5 },
      ]);

      expect(txInventoryRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'wm-id-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(txInventoryRepository.update).toHaveBeenCalledWith(
        { id: 'wm-id-1' },
        { quantity: 120.5, reservedQuantity: 0 },
      );
      expect(writtenHistory()).toMatchObject({
        action: InventoryHistoryAction.Import,
        quantityDelta: 100.5,
        quantityBefore: 20,
        quantityAfter: 120.5,
        note: 'Import form PN-1',
        changedBy: { id: 'user-id-1' },
      });
      // Chạy trong transaction của caller — không tự mở transaction mới.
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });

    it('locks rows in a fixed id order to avoid deadlocks', async () => {
      const b = row({ id: 'wm-b', material: material({ id: 'mat-b' }) });
      const a = row({ id: 'wm-a', material: material({ id: 'mat-a' }) });
      txInventoryRepository.find.mockResolvedValue([b, a]);
      txInventoryRepository.findOne.mockImplementation(async ({ where }) => row({ id: where.id }));

      await receive([
        { materialId: 'mat-b', quantity: 1 },
        { materialId: 'mat-a', quantity: 1 },
      ]);

      expect(txInventoryRepository.findOne.mock.calls.map(([q]) => q.where.id)).toEqual([
        'wm-a',
        'wm-b',
      ]);
    });

    it('rejects when a material is not assigned to the warehouse (no auto-assign)', async () => {
      txInventoryRepository.find.mockResolvedValue([row()]);

      await expectError(
        receive([
          { materialId: 'mat-id-1', quantity: 1 },
          { materialId: 'mat-missing', quantity: 1 },
        ]),
        InventoryValidation.INVENTORY_NOT_FOUND.code,
      );
      expect(txInventoryRepository.update).not.toHaveBeenCalled();
      expect(txHistoryRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('issue (export form confirmed)', () => {
    const issue = (lines: { materialId: string; quantity: number }[]) =>
      service.issue(manager as never, 'wh-id-1', lines, actor, 'Export form PX-1');

    it('sums lines per material and records one EXPORT history with a negative delta', async () => {
      txInventoryRepository.find.mockResolvedValue([row()]);
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 20, warehouse: undefined }));

      await issue([
        { materialId: 'mat-id-1', quantity: 5 },
        { materialId: 'mat-id-1', quantity: 0.5 },
      ]);

      expect(txInventoryRepository.update).toHaveBeenCalledWith(
        { id: 'wm-id-1' },
        { quantity: 14.5, reservedQuantity: 0 },
      );
      expect(writtenHistory()).toMatchObject({
        action: InventoryHistoryAction.Export,
        quantityDelta: -5.5,
        quantityBefore: 20,
        quantityAfter: 14.5,
        note: 'Export form PX-1',
      });
      expect(transactionManager.execute).not.toHaveBeenCalled();
    });

    it('rejects taking more than the stock', async () => {
      txInventoryRepository.find.mockResolvedValue([row()]);
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 3 }));

      await expectError(
        issue([{ materialId: 'mat-id-1', quantity: 5 }]),
        InventoryValidation.INVENTORY_QUANTITY_NEGATIVE.code,
      );
      expect(txInventoryRepository.update).not.toHaveBeenCalled();
    });

    it('rejects taking stock that is reserved', async () => {
      txInventoryRepository.find.mockResolvedValue([row()]);
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 10, reservedQuantity: 8 }));

      await expectError(
        issue([{ materialId: 'mat-id-1', quantity: 5 }]),
        InventoryValidation.INVENTORY_QUANTITY_BELOW_RESERVED.code,
      );
    });

    it('rejects when a material is not assigned to the warehouse', async () => {
      txInventoryRepository.find.mockResolvedValue([]);

      await expectError(
        issue([{ materialId: 'mat-missing', quantity: 1 }]),
        InventoryValidation.INVENTORY_NOT_FOUND.code,
      );
    });
  });

  describe('findAll', () => {
    const page = { page: 1, size: 10 };
    const makeQb = (pageRows: Inventory[], total: number) => {
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([pageRows, total]),
      };
      inventoryRepository.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('filters by warehouse/type via QueryBuilder, orders by COALESCE(reassignedAt, createdAt) DESC and preserves page order', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      const first = row({ id: 'wm-2', reassignedAt: new Date('2026-11-20T00:00:00.000Z') });
      const second = row({ id: 'wm-1', reassignedAt: null });
      const qb = makeQb([first, second], 11);
      // Giả lập `WHERE id IN (...)` trả ngược thứ tự để xác nhận service giữ đúng thứ tự trang.
      inventoryRepository.find.mockResolvedValue([second, first]);

      const result = await service.findAll('wh-slug-1', { ...page, typeSlug: 'type-slug-1' });

      expect(inventoryRepository.createQueryBuilder).toHaveBeenCalledWith('inventory');
      expect(qb.innerJoin).toHaveBeenCalledWith('inventory.material', 'material');
      expect(qb.innerJoin).toHaveBeenCalledWith('material.type', 'type');
      expect(qb.where).toHaveBeenCalledWith('inventory.warehouse = :warehouseId', {
        warehouseId: 'wh-id-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('type.slug = :typeSlug', {
        typeSlug: 'type-slug-1',
      });
      expect(qb.orderBy).toHaveBeenCalledWith(
        'COALESCE(inventory.reassigned_at_column, inventory.created_at_column)',
        'DESC',
      );
      expect(qb.addOrderBy).toHaveBeenCalledWith('inventory.id_column', 'DESC');
      expect(qb.offset).toHaveBeenCalledWith(0);
      expect(qb.limit).toHaveBeenCalledWith(10);
      expect(inventoryRepository.find).toHaveBeenCalledWith({
        where: { id: expect.anything() },
        relations: {
          warehouse: true,
          material: { type: true, baseUnit: true, unitsCanHave: { unit: true } },
        },
      });
      expect(result.items.map((item) => item.reassignedAt)).toEqual([
        first.reassignedAt.toString(),
        null,
      ]);
      expect(result).toMatchObject({ total: 11, totalPages: 2, hasNext: true, hasPrevios: false });
      expect(result.items[0].baseUnit).toMatchObject({
        slug: 'unit-slug-1',
        code: 'DOI',
        name: 'Đôi',
      });
      expect(result.items[0].baseUnit).not.toHaveProperty('id');
      expect(
        result.items[0].units.map(({ unitCode, conversionRate, isBaseUnit }) => ({
          unitCode,
          conversionRate,
          isBaseUnit,
        })),
      ).toEqual([
        { unitCode: 'DOI', conversionRate: 1, isBaseUnit: true },
        { unitCode: 'HOP', conversionRate: 10, isBaseUnit: false },
        { unitCode: 'THUNG', conversionRate: 100, isBaseUnit: false },
      ]);
      expect(result.items[0].units[0]).toMatchObject({
        unitSlug: 'unit-slug-1',
        unit: { slug: 'unit-slug-1', code: 'DOI', name: 'Đôi' },
      });
    });

    it('returns baseUnit null for a material without a base unit and skips hydrate when empty', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      makeQb([row({ id: 'wm-id-1' })], 1);
      inventoryRepository.find.mockResolvedValue([
        row({ material: material({ baseUnit: undefined }) }),
      ]);

      const result = await service.findAll('wh-slug-1', page);
      expect(result.items[0].baseUnit).toBeNull();

      makeQb([], 0);
      inventoryRepository.find.mockClear();
      const emptyResult = await service.findAll('wh-slug-1', page);
      expect(emptyResult.items).toEqual([]);
      expect(inventoryRepository.find).not.toHaveBeenCalled();
    });

    // Phải so với ngưỡng EFFECTIVE và coi max = 0 là không giới hạn (`NULLIF(..., 0)`).
    it('compares quantity against effective thresholds and treats max = 0 as unlimited', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      const qb = makeQb([], 0);

      await service.findAll('wh-slug-1', { ...page, belowMinimum: true, aboveMaximum: true });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'inventory.quantity < COALESCE(inventory.minimumInventory, material.minimumInventory)',
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'inventory.quantity > NULLIF(COALESCE(inventory.maximumInventory, material.maximumInventory), 0)',
      );
    });
  });

  describe('removeMaterial', () => {
    const remove = (materialSlug = 'mat-slug-1') =>
      service.removeMaterial('wh-slug-1', materialSlug, actor);

    // Check trên bản ĐÃ KHOÁ: bản `findRow` đọc trước đó có thể đã cũ.
    it('refuses to remove a material that still has stock, judged on the locked row', async () => {
      inventoryRepository.findOne.mockResolvedValue(row({ quantity: 0 }));
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 1 }));

      await expectError(remove(), InventoryValidation.INVENTORY_QUANTITY_NOT_EMPTY.code);
      expect(txInventoryRepository.softRemove).not.toHaveBeenCalled();
    });

    it('refuses to remove a material that still has reserved quantity', async () => {
      inventoryRepository.findOne.mockResolvedValue(row());
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 0, reservedQuantity: 2 }));

      await expectError(remove(), InventoryValidation.INVENTORY_RESERVED_NOT_EMPTY.code);
      expect(txInventoryRepository.softRemove).not.toHaveBeenCalled();
    });

    it('soft removes an empty row and records a REMOVE history entry', async () => {
      inventoryRepository.findOne.mockResolvedValue(row({ quantity: 0 }));
      txInventoryRepository.findOne.mockResolvedValue(row({ quantity: 0 }));

      await expect(remove()).resolves.toBe(1);
      expect(txInventoryRepository.softRemove).toHaveBeenCalled();
      expect(writtenHistory()).toMatchObject({
        action: InventoryHistoryAction.Remove,
        quantityBefore: 0,
        quantityAfter: 0,
      });
    });

    it('reports WAREHOUSE_NOT_FOUND rather than a missing assignment when the warehouse is unknown', async () => {
      inventoryRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expect(service.removeMaterial('nope', 'mat-slug-1', actor)).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
    });

    it('reports a missing assignment when the warehouse exists but the material is not in it', async () => {
      inventoryRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());

      await expectError(remove('other-mat'), InventoryValidation.INVENTORY_NOT_FOUND.code);
    });
  });

  describe('findHistories', () => {
    it('lists the history of the row newest first, keeping soft-deleted actors', async () => {
      inventoryRepository.findOne.mockResolvedValue(row());
      historyRepository.findAndCount.mockResolvedValue([
        [
          {
            slug: 'h-1',
            action: InventoryHistoryAction.Adjust,
            quantityDelta: 5,
            quantityBefore: 20,
            quantityAfter: 25,
            reservedDelta: 0,
            reservedBefore: 0,
            reservedAfter: 0,
            changedBy: { slug: 'u-1', firstName: 'An', lastName: 'Nguyễn' },
          },
        ],
        1,
      ]);

      const result = await service.findHistories('wh-slug-1', 'mat-slug-1', {
        page: 1,
        size: 10,
      });

      expect(historyRepository.findAndCount.mock.calls[0][0]).toMatchObject({
        where: { inventory: { id: 'wm-id-1' } },
        withDeleted: true,
        order: { createdAt: 'DESC' },
      });
      expect(result.items[0]).toMatchObject({
        action: 'ADJUST',
        quantityAfter: 25,
        note: null,
        changedBySlug: 'u-1',
        changedByName: 'Nguyễn An',
      });
    });
  });
});
