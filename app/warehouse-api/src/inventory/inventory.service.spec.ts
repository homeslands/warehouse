import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { InventoryService } from './inventory.service';
import { InventoryProfile } from './inventory.mapper';
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

const warehouse = (overrides: Partial<Warehouse> = {}): Warehouse =>
  ({ id: 'wh-id-1', slug: 'wh-slug-1', isActive: true, ...overrides }) as Warehouse;

const material = (overrides: Partial<Material> = {}): Material =>
  ({
    id: 'mat-id-1',
    slug: 'mat-slug-1',
    code: 'MAT-001',
    name: 'Găng tay',
    type: { id: 'type-id-1', slug: 'type-slug-1', name: 'Tiêu hao' },
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
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    metadata: { name: 'Inventory' },
  };
  const warehouseRepository = { findOneBy: jest.fn() };
  const historyRepository = { findAndCount: jest.fn() };
  const materialService = { findEntityBySlug: jest.fn() };
  const actor = { userId: 'user-id-1', scope: [] };

  /** Repository lấy qua `manager` bên trong transaction — tách khỏi repository inject ở ngoài. */
  const txInventoryRepository = {
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
        {
          provide: getRepositoryToken(Inventory),
          useValue: inventoryRepository,
        },
        { provide: getRepositoryToken(InventoryHistory), useValue: historyRepository },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: TransactionManagerService, useValue: transactionManager },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
        { provide: MaterialService, useValue: materialService },
      ],
    }).compile();
    await module.init();

    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assignMaterial', () => {
    const assign = (overrides: Record<string, unknown> = {}) =>
      service.assignMaterial('wh-slug-1', { materialSlug: 'mat-slug-1', ...overrides }, actor);

    it('creates the row and falls back to the material thresholds when no override is given', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      inventoryRepository.findOne.mockResolvedValue(null);
      inventoryRepository.create.mockImplementation((data) => data);

      const result = await assign({ quantity: 5 });

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
        materialCode: 'MAT-001',
        warehouseSlug: 'wh-slug-1',
      });
    });

    it('writes the row and an ASSIGN history entry in the same transaction', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      inventoryRepository.findOne.mockResolvedValue(null);
      inventoryRepository.create.mockImplementation((data) => ({ id: 'wm-id-1', ...data }));

      await assign({ quantity: 5 });

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(txInventoryRepository.save).toHaveBeenCalledTimes(1);
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

    // UNIQUE(warehouse, material) không bỏ qua soft-delete, nên row đã xoá vẫn phải chặn ở tầng app.
    it('rejects a material already assigned, including a soft-deleted row', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      inventoryRepository.findOne.mockResolvedValue(row({ deletedAt: new Date() }));

      await expectError(assign(), InventoryValidation.INVENTORY_DOES_EXIST.code);
    });

    it('throws WAREHOUSE_NOT_FOUND when the warehouse slug is unknown', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expect(assign()).rejects.toBeInstanceOf(WarehouseException);
      await expect(assign()).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
    });

    // Override 1 vế phải so với vế EFFECTIVE còn lại, không so với null.
    it('rejects an override that conflicts with the material default on the other side', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      inventoryRepository.findOne.mockResolvedValue(null);
      inventoryRepository.create.mockImplementation((data) => data);

      await expectError(
        assign({ minimumInventory: 500 }),
        InventoryValidation.INVENTORY_RANGE_INVALID.code,
      );
      expect(transactionManager.execute).not.toHaveBeenCalled();
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

    it('rejects an update that would make max lower than min', async () => {
      inventoryRepository.findOne.mockResolvedValue(row());

      await expectError(
        service.updateThresholds('wh-slug-1', 'mat-slug-1', { maximumInventory: 5 }),
        InventoryValidation.INVENTORY_RANGE_INVALID.code,
      );
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

  describe('findAll', () => {
    const page = { page: 1, size: 10, sort: [] };

    it('filters by warehouse/type and paginates without the query builder', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      inventoryRepository.findAndCount.mockResolvedValue([[row()], 11]);

      const result = await service.findAll('wh-slug-1', { ...page, typeSlug: 'type-slug-1' });

      const options = inventoryRepository.findAndCount.mock.calls[0][0];
      expect(options).toMatchObject({
        where: { warehouse: { id: 'wh-id-1' }, material: { type: { slug: 'type-slug-1' } } },
        relations: { warehouse: true, material: { type: true } },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
      expect(options.where.material.minimumInventory).toBeUndefined();
      expect(options.where.material.maximumInventory).toBeUndefined();
      expect(result).toMatchObject({ total: 11, totalPages: 2, hasNext: true, hasPrevios: false });
    });

    // Phải so với ngưỡng EFFECTIVE (override ?? mặc định của material), không phải chỉ override.
    it('compares quantity against the effective thresholds', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      inventoryRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('wh-slug-1', { ...page, belowMinimum: true, aboveMaximum: true });

      const { material: where } = inventoryRepository.findAndCount.mock.calls[0][0].where;
      expect(where.minimumInventory.getSql('m.minimumInventory')).toBe(
        'Inventory.quantity < COALESCE(Inventory.minimumInventory, m.minimumInventory)',
      );
      expect(where.maximumInventory.getSql('m.maximumInventory')).toBe(
        'Inventory.quantity > COALESCE(Inventory.maximumInventory, m.maximumInventory)',
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
        sort: [],
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
