import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { WarehouseMaterialService } from './warehouse-material.service';
import { WarehouseMaterialProfile } from './warehouse-material.mapper';
import { WarehouseMaterial } from './warehouse-material.entity';
import { WarehouseMaterialException } from './warehouse-material.exception';
import { WarehouseMaterialValidation } from './warehouse-material.validation';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { Material } from 'src/material/material.entity';
import { MaterialService } from 'src/material/material.service';

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

const row = (overrides: Partial<WarehouseMaterial> = {}): WarehouseMaterial =>
  ({
    id: 'wm-id-1',
    slug: 'wm-slug-1',
    warehouse: warehouse(),
    material: material(),
    quantity: 20,
    minimumInventory: null,
    maximumInventory: null,
    ...overrides,
  }) as WarehouseMaterial;

const expectError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(WarehouseMaterialException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('WarehouseMaterialService', () => {
  let service: WarehouseMaterialService;
  const warehouseMaterialRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softRemove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const warehouseRepository = { findOneBy: jest.fn() };
  const materialService = { findEntityBySlug: jest.fn() };

  /** Chuỗi `.update().set().where().andWhere().execute()` của TypeORM, trả `affected` cho trước. */
  const mockUpdateBuilder = (affected: number) => {
    const builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected }),
    };
    warehouseMaterialRepository.createQueryBuilder.mockReturnValue(builder);
    return builder;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseMaterialService,
        WarehouseMaterialProfile,
        {
          provide: getRepositoryToken(WarehouseMaterial),
          useValue: warehouseMaterialRepository,
        },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
        { provide: MaterialService, useValue: materialService },
      ],
    }).compile();
    await module.init();

    service = module.get<WarehouseMaterialService>(WarehouseMaterialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assignMaterial', () => {
    const assign = (overrides: Record<string, unknown> = {}) =>
      service.assignMaterial('wh-slug-1', { materialSlug: 'mat-slug-1', ...overrides });

    it('creates the row and falls back to the material thresholds when no override is given', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      warehouseMaterialRepository.findOne.mockResolvedValue(null);
      warehouseMaterialRepository.create.mockImplementation((data) => data);
      warehouseMaterialRepository.save.mockImplementation((data) => data);

      const result = await assign({ quantity: 5 });

      expect(result).toMatchObject({
        quantity: 5,
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

    it('refuses to manage materials of an inactive warehouse', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse({ isActive: false }));

      await expectError(
        assign(),
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_WAREHOUSE_INACTIVE.code,
      );
    });

    // UNIQUE(warehouse, material) không bỏ qua soft-delete, nên row đã xoá vẫn phải chặn ở tầng app.
    it('rejects a material already assigned, including a soft-deleted row', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());
      materialService.findEntityBySlug.mockResolvedValue(material());
      warehouseMaterialRepository.findOne.mockResolvedValue(row({ deletedAt: new Date() }));

      await expectError(assign(), WarehouseMaterialValidation.WAREHOUSE_MATERIAL_DOES_EXIST.code);
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
      warehouseMaterialRepository.findOne.mockResolvedValue(null);
      warehouseMaterialRepository.create.mockImplementation((data) => data);

      await expectError(
        assign({ minimumInventory: 500 }),
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_INVENTORY_RANGE_INVALID.code,
      );
      expect(warehouseMaterialRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateThresholds', () => {
    it('distinguishes "field not sent" from "null" when clearing an override', async () => {
      warehouseMaterialRepository.findOne.mockResolvedValue(
        row({ minimumInventory: 30, maximumInventory: 80 }),
      );
      warehouseMaterialRepository.save.mockImplementation((data) => data);

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
      warehouseMaterialRepository.findOne.mockResolvedValue(row());

      await expectError(
        service.updateThresholds('wh-slug-1', 'mat-slug-1', { maximumInventory: 5 }),
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_INVENTORY_RANGE_INVALID.code,
      );
    });
  });

  describe('adjustQuantity', () => {
    it('applies the delta through one conditional UPDATE, not read-then-write', async () => {
      warehouseMaterialRepository.findOne.mockResolvedValue(row({ quantity: 20 }));
      const builder = mockUpdateBuilder(1);

      await service.adjustQuantity('wh-slug-1', 'mat-slug-1', { delta: -5 });

      expect(builder.execute).toHaveBeenCalled();
      // Không được `save()` cả entity — đó chính là đọc-rồi-ghi mà điều kiện SQL đang tránh.
      expect(warehouseMaterialRepository.save).not.toHaveBeenCalled();
    });

    it('rejects the adjustment when the conditional UPDATE matched no row (would go negative)', async () => {
      warehouseMaterialRepository.findOne.mockResolvedValue(row({ quantity: 3 }));
      mockUpdateBuilder(0);

      await expectError(
        service.adjustQuantity('wh-slug-1', 'mat-slug-1', { delta: -10 }),
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_QUANTITY_NEGATIVE.code,
      );
    });

    // `@IsNotEmpty()` của class-validator KHÔNG coi 0 là empty, nên rào này phải nằm ở service.
    it('rejects a zero delta before touching the database', async () => {
      await expectError(
        service.adjustQuantity('wh-slug-1', 'mat-slug-1', { delta: 0 }),
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_DELTA_INVALID.code,
      );
      expect(warehouseMaterialRepository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('removeMaterial', () => {
    it('refuses to remove a material that still has stock', async () => {
      warehouseMaterialRepository.findOne.mockResolvedValue(row({ quantity: 1 }));

      await expectError(
        service.removeMaterial('wh-slug-1', 'mat-slug-1'),
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_QUANTITY_NOT_EMPTY.code,
      );
      expect(warehouseMaterialRepository.softRemove).not.toHaveBeenCalled();
    });

    it('soft removes a row whose stock is zero', async () => {
      warehouseMaterialRepository.findOne.mockResolvedValue(row({ quantity: 0 }));

      await expect(service.removeMaterial('wh-slug-1', 'mat-slug-1')).resolves.toBe(1);
      expect(warehouseMaterialRepository.softRemove).toHaveBeenCalled();
    });

    it('reports WAREHOUSE_NOT_FOUND rather than a missing assignment when the warehouse is unknown', async () => {
      warehouseMaterialRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expect(service.removeMaterial('nope', 'mat-slug-1')).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
    });

    it('reports a missing assignment when the warehouse exists but the material is not in it', async () => {
      warehouseMaterialRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue(warehouse());

      await expectError(
        service.removeMaterial('wh-slug-1', 'other-mat'),
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_NOT_FOUND.code,
      );
    });
  });
});
