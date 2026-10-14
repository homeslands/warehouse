import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MaterialService } from './material.service';
import { MaterialProfile } from './material.mapper';
import { Material } from './material.entity';
import { MaterialUnit } from './material-unit.entity';
import { MaterialException } from './material.exception';
import { MaterialValidation } from './material.validation';
import { MaterialTypeService } from 'src/material-type/material-type.service';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { UnitService } from 'src/unit/unit.service';
import { Unit } from 'src/unit/unit.entity';
import { MaterialType } from 'src/material-type/material-type.entity';
import { Inventory } from 'src/inventory/inventory.entity';
import { Supplier } from 'src/supplier/supplier.entity';
import { MaterialTypeProfile } from 'src/material-type/material-type.mapper';
import { UnitProfile } from 'src/unit/unit.mapper';
import { SupplierProfile } from 'src/supplier/supplier.mapper';
import { SupplierValidation } from 'src/supplier/supplier.validation';

const materialType = () =>
  ({ id: 'type-id-1', slug: 'type-slug-1', code: 'MT-01', name: 'Tiêu hao' }) as MaterialType;

const unit = (overrides: Partial<Unit> = {}): Unit =>
  ({ id: 'unit-id-1', slug: 'unit-slug-1', code: 'KG', name: 'Kilogram', ...overrides }) as Unit;

const baseMaterial = (overrides: Partial<Material> = {}): Material =>
  ({
    id: 'material-id-1',
    slug: 'mat-slug-1',
    code: 'MAT-001',
    name: 'Găng tay cao su',
    type: materialType(),
    minimumInventory: 10,
    maximumInventory: 100,
    ...overrides,
  }) as Material;

const createDto = (overrides: Record<string, unknown> = {}) => ({
  code: 'MAT-001',
  name: 'Găng tay cao su',
  typeSlug: 'type-slug-1',
  baseUnitSlug: 'unit-slug-1',
  minimumInventory: 10,
  maximumInventory: 100,
  ...overrides,
});

/** QueryBuilder giả cho phép đếm dòng tồn kho > 0 (rào khoá đổi đơn vị cơ sở). */
const qbCount = (count: number) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(count),
});

const expectError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(MaterialException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('MaterialService', () => {
  let service: MaterialService;
  const materialRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    softRemove: jest.fn(),
  };
  const inventoryRepository = {
    countBy: jest.fn(),
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };
  // Manager giả của transaction: chạy thẳng callback, ghi nhận lời gọi để kiểm THỨ TỰ ghi 2 bảng
  // (FK tổ hợp bắt buộc: tạo dòng join trước, trỏ base_unit_id sau, xoá dòng cũ cuối cùng).
  const manager = {
    // Uỷ quyền về `materialRepository.save` để test cũ (vốn assert trên repo) vẫn đọc được, đồng
    // thời ghi nhận thứ tự gọi ở `manager.save`.
    save: jest.fn((entity) => materialRepository.save(entity)),
    countBy: jest.fn(),
    delete: jest.fn(),
    // Bảng join `material_supplier_tbl` ghi bằng SQL tay (`material-supplier.util.ts`).
    query: jest.fn(),
  };
  const supplierRepository = { find: jest.fn() };
  const transactionManagerService = {
    execute: jest.fn((onSave: (m: typeof manager) => unknown) => onSave(manager)),
  };
  const materialUnitRepository = {
    countBy: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const materialTypeService = { findEntityBySlug: jest.fn() };
  const unitService = { findEntityBySlug: jest.fn(), findAll: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Mặc định vật tư chưa gán vào kho nào; test về `warehouses` tự mock lại.
    inventoryRepository.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialService,
        MaterialProfile,
        MaterialTypeProfile,
        UnitProfile,
        SupplierProfile,
        { provide: getRepositoryToken(Material), useValue: materialRepository },
        { provide: getRepositoryToken(Inventory), useValue: inventoryRepository },
        { provide: getRepositoryToken(MaterialUnit), useValue: materialUnitRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
        { provide: MaterialTypeService, useValue: materialTypeService },
        { provide: UnitService, useValue: unitService },
        { provide: TransactionManagerService, useValue: transactionManagerService },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepository },
      ],
    }).compile();
    await module.init();

    service = module.get<MaterialService>(MaterialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const supplier = () =>
      ({
        id: 'supplier-id-1',
        slug: 'sup-slug-1',
        code: 'SUP-01',
        name: 'Nhà cung cấp A',
      }) as Supplier;

    it('load suppliers/type/baseUnit và trả object lồng kèm hasSupplier', async () => {
      materialRepository.findAndCount.mockResolvedValue([
        [baseMaterial({ type: materialType(), baseUnit: unit(), suppliers: [supplier()] })],
        1,
      ]);

      const result = await service.findAll({ page: 1, size: 10 } as never);

      expect(materialRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: { type: true, baseUnit: true, suppliers: true },
        }),
      );
      expect(result.items[0]).toMatchObject({
        hasSupplier: true,
        suppliers: [{ slug: 'sup-slug-1', code: 'SUP-01', name: 'Nhà cung cấp A' }],
        type: { slug: 'type-slug-1', code: 'MT-01', name: 'Tiêu hao' },
        baseUnit: { slug: 'unit-slug-1', code: 'KG', name: 'Kilogram' },
      });
      expect(result.items[0]).not.toHaveProperty('typeSlug');
      expect(result.items[0]).not.toHaveProperty('baseUnitSlug');
      expect(result.items[0]).not.toHaveProperty('supplier');
    });

    it('trả đủ mọi nhà cung cấp của vật tư (n - n)', async () => {
      const other = { ...supplier(), id: 'supplier-id-2', slug: 'sup-slug-2', code: 'SUP-02' };
      materialRepository.findAndCount.mockResolvedValue([
        [baseMaterial({ type: materialType(), suppliers: [supplier(), other as Supplier] })],
        1,
      ]);

      const result = await service.findAll({ page: 1, size: 10 } as never);

      expect(result.items[0].suppliers.map(({ slug }) => slug)).toEqual([
        'sup-slug-1',
        'sup-slug-2',
      ]);
    });

    it('hasSupplier = false và suppliers = [] khi vật tư chưa gắn nhà cung cấp', async () => {
      materialRepository.findAndCount.mockResolvedValue([
        [baseMaterial({ type: materialType(), baseUnit: undefined, suppliers: [] })],
        1,
      ]);

      const result = await service.findAll({ page: 1, size: 10 } as never);

      expect(result.items[0]).toMatchObject({ hasSupplier: false, suppliers: [], baseUnit: null });
    });

    // Lọc bằng subquery trên `id`, KHÔNG bằng `where.suppliers` — lọc trên relation đang load sẽ cắt
    // luôn danh sách nhà cung cấp trả về.
    const idFilter = () => {
      const { where } = materialRepository.findAndCount.mock.calls[0][0];
      expect(where).not.toHaveProperty('suppliers');
      return {
        sql: where.id.getSql('m.id') as string,
        params: where.id.objectLiteralParameters,
      };
    };

    it.each([
      ['true', true, 'm.id IN ('],
      ['false', false, 'm.id NOT IN ('],
    ])('lọc hasSupplier=%s bằng subquery trên bảng join', async (_label, hasSupplier, prefix) => {
      materialRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, size: 10, hasSupplier } as never);

      const { sql } = idFilter();
      expect(sql.startsWith(prefix)).toBe(true);
      expect(sql).toContain('material_supplier_tbl');
      expect(sql).toContain('s.deleted_at_column IS NULL');
    });

    it('lọc theo supplierSlug, ưu tiên hơn hasSupplier', async () => {
      materialRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        page: 1,
        size: 10,
        supplierSlug: 'sup-slug-1',
        hasSupplier: false,
      } as never);

      const { sql, params } = idFilter();
      expect(sql.startsWith('m.id IN (')).toBe(true);
      expect(sql).toContain('s.slug_column = :supplierSlug');
      expect(params).toEqual({ supplierSlug: 'sup-slug-1' });
    });

    it('lọc theo warehouseSlug và typeSlug cùng lúc', async () => {
      materialRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        page: 1,
        size: 10,
        warehouseSlug: 'wh-slug-1',
        typeSlug: 'type-slug-1',
      } as never);

      expect(materialRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: { slug: 'type-slug-1' },
            inventories: { warehouse: { slug: 'wh-slug-1' } },
          },
          // Không load `inventories` theo relation: có `where` trên nó thì danh sách kho bị lọc theo.
          relations: { type: true, baseUnit: true, suppliers: true },
        }),
      );
    });

    it('trả warehouses của từng vật tư bằng 1 query cho cả trang (không bị lọc theo warehouseSlug)', async () => {
      const m1 = baseMaterial({ id: 'mat-1', slug: 'm1', type: materialType(), suppliers: [] });
      const m2 = baseMaterial({ id: 'mat-2', slug: 'm2', type: materialType(), suppliers: [] });
      materialRepository.findAndCount.mockResolvedValue([[m1, m2], 2]);
      inventoryRepository.find.mockResolvedValue([
        {
          material: { id: 'mat-1' },
          warehouse: { slug: 'wh-a', code: 'KHO-A', name: 'Kho A' },
          quantity: 10,
          reservedQuantity: 2.5,
        },
        {
          material: { id: 'mat-1' },
          warehouse: { slug: 'wh-b', code: 'KHO-B', name: 'Kho B' },
          quantity: 0,
          reservedQuantity: 0,
        },
      ]);

      const result = await service.findAll({ page: 1, size: 10, warehouseSlug: 'wh-a' } as never);

      expect(inventoryRepository.find).toHaveBeenCalledTimes(1);
      expect(inventoryRepository.find.mock.calls[0][0].where.material.id.value).toEqual([
        'mat-1',
        'mat-2',
      ]);
      expect(result.items[0].warehouses).toEqual([
        { slug: 'wh-a', code: 'KHO-A', name: 'Kho A', quantity: 10, availableQuantity: 7.5 },
        { slug: 'wh-b', code: 'KHO-B', name: 'Kho B', quantity: 0, availableQuantity: 0 },
      ]);
      expect(result.items[1].warehouses).toEqual([]);
    });

    it('bỏ qua dòng tồn trỏ tới kho đã xoá mềm (warehouse = null) thay vì làm sập response', async () => {
      const m1 = baseMaterial({ id: 'mat-1', slug: 'm1', type: materialType(), suppliers: [] });
      materialRepository.findAndCount.mockResolvedValue([[m1], 1]);
      inventoryRepository.find.mockResolvedValue([
        {
          material: { id: 'mat-1' },
          warehouse: null,
          quantity: 5,
          reservedQuantity: 0,
        },
        {
          material: { id: 'mat-1' },
          warehouse: { slug: 'wh-a', code: 'KHO-A', name: 'Kho A' },
          quantity: 1,
          reservedQuantity: 0,
        },
      ]);

      const result = await service.findAll({ page: 1, size: 10 } as never);

      expect(result.items[0].warehouses).toEqual([
        { slug: 'wh-a', code: 'KHO-A', name: 'Kho A', quantity: 1, availableQuantity: 1 },
      ]);
    });

    it('không lọc supplier khi không gửi hasSupplier', async () => {
      materialRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, size: 10 } as never);

      expect(materialRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('assignSuppliers — PUT thay cả tập', () => {
    const sup = (n: number) =>
      ({ id: `sup-id-${n}`, slug: `sup-${n}`, code: `SUP-0${n}`, name: `NCC ${n}` }) as Supplier;

    const loaded = (suppliers: Supplier[]) =>
      materialRepository.findOne.mockResolvedValue(
        baseMaterial({ type: materialType(), baseUnit: unit(), suppliers }),
      );

    const sqlCalls = () => manager.query.mock.calls.map(([sql, params]) => ({ sql, params }));

    it('chỉ ghi phần chênh lệch: gỡ cặp thừa, thêm cặp mới (INSERT IGNORE), trong 1 transaction', async () => {
      loaded([sup(1), sup(2)]);
      supplierRepository.find.mockResolvedValue([sup(2), sup(3)]);

      const result = await service.assignSuppliers('material-slug-1', {
        supplierSlugs: ['sup-2', 'sup-3'],
      });

      expect(transactionManagerService.execute).toHaveBeenCalledTimes(1);
      const [del, ins] = sqlCalls();
      expect(del.sql).toContain('DELETE FROM `material_supplier_tbl`');
      expect(del.params).toEqual([['material-id-1'], ['sup-id-1']]);
      expect(ins.sql).toContain('INSERT IGNORE INTO `material_supplier_tbl`');
      expect(ins.params).toEqual([[['material-id-1', 'sup-id-3']]]);
      expect(result.suppliers.map(({ slug }) => slug)).toEqual(['sup-2', 'sup-3']);
      expect(result.hasSupplier).toBe(true);
    });

    it('mảng rỗng = gỡ hết nhà cung cấp, không tra supplier', async () => {
      loaded([sup(1)]);

      const result = await service.assignSuppliers('material-slug-1', { supplierSlugs: [] });

      expect(supplierRepository.find).not.toHaveBeenCalled();
      const [del] = sqlCalls();
      expect(del.params).toEqual([['material-id-1'], ['sup-id-1']]);
      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ hasSupplier: false, suppliers: [] });
    });

    it('không ghi gì khi tập mới trùng tập cũ', async () => {
      loaded([sup(1)]);
      supplierRepository.find.mockResolvedValue([sup(1)]);

      await service.assignSuppliers('material-slug-1', { supplierSlugs: ['sup-1'] });

      expect(transactionManagerService.execute).not.toHaveBeenCalled();
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('1 slug không tồn tại ⇒ SUPPLIER_NOT_FOUND cho cả lô, không ghi gì', async () => {
      loaded([]);
      supplierRepository.find.mockResolvedValue([sup(1)]);

      await expect(
        service.assignSuppliers('material-slug-1', { supplierSlugs: ['sup-1', 'missing'] }),
      ).rejects.toMatchObject({ code: SupplierValidation.SUPPLIER_NOT_FOUND.code });
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('vật tư không tồn tại ⇒ MATERIAL_NOT_FOUND', async () => {
      materialRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.assignSuppliers('missing', { supplierSlugs: [] }),
        MaterialValidation.MATERIAL_NOT_FOUND.code,
      );
    });
  });

  describe('createMaterial', () => {
    // `baseUnitSlug` bắt buộc khi tạo ⇒ mọi lần tạo đều tra unit.
    beforeEach(() => unitService.findEntityBySlug.mockResolvedValue(unit()));

    it('resolves typeSlug to the real entity and upper-cases the code', async () => {
      materialRepository.findOne.mockResolvedValue(null);
      materialTypeService.findEntityBySlug.mockResolvedValue(materialType());
      materialRepository.create.mockImplementation((data) => data);
      materialRepository.save.mockImplementation((data) => data);

      const result = await service.createMaterial(createDto({ code: ' mat-001 ' }));

      expect(materialTypeService.findEntityBySlug).toHaveBeenCalledWith('type-slug-1');
      expect(materialRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'MAT-001',
          type: expect.objectContaining({ id: 'type-id-1' }),
        }),
      );
      // Quan hệ `type` được flatten ra 3 field phẳng, không lồng cả DTO loại vật tư vào response.
      expect(result).toMatchObject({ type: { slug: 'type-slug-1', code: 'MT-01' } });
    });

    it('rejects maximumInventory below minimumInventory', async () => {
      materialRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.createMaterial(createDto({ minimumInventory: 50, maximumInventory: 10 })),
        MaterialValidation.MATERIAL_INVENTORY_RANGE_INVALID.code,
      );
      expect(materialRepository.save).not.toHaveBeenCalled();
    });

    it('accepts minimum equal to maximum', async () => {
      materialRepository.findOne.mockResolvedValue(null);
      materialTypeService.findEntityBySlug.mockResolvedValue(materialType());
      materialRepository.create.mockImplementation((data) => data);
      materialRepository.save.mockImplementation((data) => data);

      await expect(
        service.createMaterial(createDto({ minimumInventory: 20, maximumInventory: 20 })),
      ).resolves.toBeDefined();
    });

    it('reports a different error when the code is held by a soft-deleted material', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ deletedAt: new Date() }));

      await expectError(
        service.createMaterial(createDto()),
        MaterialValidation.MATERIAL_CODE_RESERVED_BY_DELETED.code,
      );
    });
  });

  describe('createMaterialIn (transaction của caller)', () => {
    beforeEach(() => unitService.findEntityBySlug.mockResolvedValue(unit()));

    it('ghi bằng manager được truyền vào, không tự mở transaction, trả entity', async () => {
      materialRepository.findOne.mockResolvedValue(null);
      materialTypeService.findEntityBySlug.mockResolvedValue(materialType());
      materialRepository.create.mockImplementation((data) => ({ id: 'material-id-1', ...data }));
      materialRepository.save.mockImplementation((data) => data);
      materialUnitRepository.create.mockImplementation((data) => data);

      const created = await service.createMaterialIn(manager as never, createDto() as never);

      expect(transactionManagerService.execute).not.toHaveBeenCalled();
      // Vẫn đúng thứ tự FK tổ hợp: vật tư → dòng join rate = 1 → trỏ base_unit_id.
      expect(manager.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          materialId: 'material-id-1',
          unitId: 'unit-id-1',
          conversionRate: 1,
        }),
      );
      expect(created).toMatchObject({ code: 'MAT-001', baseUnit: { id: 'unit-id-1' } });
    });

    it('chạy đủ rào như createMaterial (trùng mã) trước khi ghi', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());

      await expectError(
        service.createMaterialIn(manager as never, createDto() as never),
        MaterialValidation.MATERIAL_CODE_DOES_EXIST.code,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  // PATCH phải là partial update đúng nghĩa REST: field không gửi giữ nguyên giá trị cũ.
  describe('updateMaterial — partial (PATCH)', () => {
    it('chỉ đổi field được gửi, các field khác giữ nguyên', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      materialRepository.save.mockImplementation((data) => data);

      const result = await service.updateMaterial('mat-slug-1', {
        name: 'Găng tay nitrile',
      } as never);

      expect(result).toMatchObject({ name: 'Găng tay nitrile', code: 'MAT-001' });
    });

    // `PartialType` sao chép initializer `= 0` của DTO cha ⇒ nếu không huỷ, PATCH không gửi ngưỡng
    // tồn sẽ reset cả 2 về 0.
    it('không reset ngưỡng tồn về 0 khi PATCH không gửi chúng', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      materialRepository.save.mockImplementation((data) => data);

      const result = await service.updateMaterial('mat-slug-1', {
        name: 'Tên mới',
      } as never);

      expect(result).toMatchObject({ minimumInventory: 10, maximumInventory: 100 });
    });

    // Tra `findEntityBySlug(undefined)` sẽ ném `MATERIAL_TYPE_NOT_FOUND` oan.
    it('không tra lại materialType khi PATCH không gửi typeSlug', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      materialRepository.save.mockImplementation((data) => data);

      await service.updateMaterial('mat-slug-1', { name: 'Tên mới' } as never);

      expect(materialTypeService.findEntityBySlug).not.toHaveBeenCalled();
    });

    // Ngưỡng phải so trên giá trị SAU khi ghép, không phải trên mỗi phần client gửi.
    it('chặn khi minimumInventory mới vượt maximumInventory đang có trong DB', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());

      await expectError(
        service.updateMaterial('mat-slug-1', { minimumInventory: 999 } as never),
        MaterialValidation.MATERIAL_INVENTORY_RANGE_INVALID.code,
      );
    });
  });

  describe('deleteMaterial', () => {
    it('refuses to delete a material still assigned to a warehouse', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      inventoryRepository.countBy.mockResolvedValue(1);

      await expectError(
        service.deleteMaterial('mat-slug-1'),
        MaterialValidation.MATERIAL_IN_USE.code,
      );
      expect(materialRepository.softRemove).not.toHaveBeenCalled();
    });

    it('soft removes a material assigned to no warehouse', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      inventoryRepository.countBy.mockResolvedValue(0);

      await expect(service.deleteMaterial('mat-slug-1')).resolves.toBe(1);
      expect(materialRepository.softRemove).toHaveBeenCalled();
    });
  });

  describe('baseUnit (đơn vị cơ sở)', () => {
    it('resolves baseUnitSlug ra entity thật khi tạo mới', async () => {
      materialRepository.findOne.mockResolvedValue(null);
      materialTypeService.findEntityBySlug.mockResolvedValue(materialType());
      unitService.findEntityBySlug.mockResolvedValue(unit());
      materialRepository.create.mockImplementation((data) => data);
      materialRepository.save.mockImplementation((data) => data);

      const result = await service.createMaterial(createDto({ baseUnitSlug: 'unit-slug-1' }));

      expect(unitService.findEntityBySlug).toHaveBeenCalledWith('unit-slug-1');
      expect(materialRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ baseUnit: unit() }),
      );
      expect(result).toMatchObject({ baseUnit: { slug: 'unit-slug-1', code: 'KG' } });
    });

    it('không tạo vật tư khi baseUnitSlug không tồn tại', async () => {
      materialRepository.findOne.mockResolvedValue(null);
      materialTypeService.findEntityBySlug.mockResolvedValue(materialType());
      unitService.findEntityBySlug.mockRejectedValue(new Error('UNIT_NOT_FOUND'));

      await expect(service.createMaterial(createDto({ baseUnitSlug: 'ghost' }))).rejects.toThrow(
        'UNIT_NOT_FOUND',
      );
      expect(transactionManagerService.execute).not.toHaveBeenCalled();
    });

    it('không tra unit khi PATCH không gửi baseUnitSlug', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      materialRepository.save.mockImplementation((data) => data);

      const result = await service.updateMaterial('mat-slug-1', { name: 'Tên mới' });

      expect(unitService.findEntityBySlug).not.toHaveBeenCalled();
      expect(materialUnitRepository.countBy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ baseUnit: { slug: 'unit-slug-1' } });
    });

    it('đặt base unit lần đầu: tạo dòng join rate = 1 TRƯỚC khi trỏ base_unit_id', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      unitService.findEntityBySlug.mockResolvedValue(unit());
      manager.countBy.mockResolvedValue(0);
      materialRepository.save.mockImplementation((data) => data);
      materialUnitRepository.create.mockImplementation((data) => data);

      const result = await service.updateMaterial('mat-slug-1', {
        baseUnitSlug: 'unit-slug-1',
      });

      // FK tổ hợp (id, base_unit_id) -> (material_id, unit_id): dòng join phải tồn tại trước.
      expect(manager.save.mock.calls[0][0]).toMatchObject({
        materialId: 'material-id-1',
        unitId: 'unit-id-1',
        conversionRate: 1,
      });
      expect(manager.save.mock.calls[1][0]).toMatchObject({ baseUnit: unit() });
      expect(result).toMatchObject({ baseUnit: { slug: 'unit-slug-1', name: 'Kilogram' } });
    });

    it('đổi base unit khi vật tư còn sạch: xoá dòng join cũ SAU khi con trỏ đã rời đi', async () => {
      const existing = baseMaterial({ baseUnit: unit() });
      materialRepository.findOne.mockResolvedValue(existing);
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-9', slug: 'unit-slug-9', code: 'BAO' }),
      );
      inventoryRepository.createQueryBuilder.mockReturnValue(qbCount(0));
      materialUnitRepository.countBy.mockResolvedValue(1); // chỉ có đúng dòng base
      manager.countBy.mockResolvedValue(0);
      materialRepository.save.mockImplementation((data) => data);
      materialUnitRepository.create.mockImplementation((data) => data);

      await service.updateMaterial('mat-slug-1', { baseUnitSlug: 'unit-slug-9' });

      // RESTRICT: chỉ được xoá dòng cũ sau khi `base_unit_id` đã trỏ sang dòng mới.
      expect(manager.delete).toHaveBeenCalledWith(MaterialUnit, {
        materialId: 'material-id-1',
        unitId: 'unit-id-1',
      });
      expect(manager.save.mock.invocationCallOrder[1]).toBeLessThan(
        manager.delete.mock.invocationCallOrder[0],
      );
    });

    // Đổi base unit = đổi nghĩa mọi tỉ lệ đã lưu và mọi con số tồn kho.
    it('khoá đổi base unit khi vật tư đã có tồn ở kho', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-9', slug: 'unit-slug-9' }),
      );
      inventoryRepository.createQueryBuilder.mockReturnValue(qbCount(1));
      materialUnitRepository.countBy.mockResolvedValue(1);

      await expectError(
        service.updateMaterial('mat-slug-1', { baseUnitSlug: 'unit-slug-9' }),
        MaterialValidation.MATERIAL_BASE_UNIT_LOCKED.code,
      );
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('khoá đổi base unit khi vật tư đã gắn đơn vị quy đổi khác', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-9', slug: 'unit-slug-9' }),
      );
      inventoryRepository.createQueryBuilder.mockReturnValue(qbCount(0));
      materialUnitRepository.countBy.mockResolvedValue(3);

      await expectError(
        service.updateMaterial('mat-slug-1', { baseUnitSlug: 'unit-slug-9' }),
        MaterialValidation.MATERIAL_BASE_UNIT_LOCKED.code,
      );
    });
  });

  describe('findAvailableConversionUnits', () => {
    // Đơn vị cơ sở đã là 1 dòng của bảng join nên nằm sẵn trong danh sách đã gắn — không loại riêng.
    it('loại mọi unit đã gắn, gồm cả dòng của đơn vị cơ sở', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      materialUnitRepository.find.mockResolvedValue([
        { unitId: 'unit-id-1' },
        { unitId: 'unit-id-9' },
      ]);
      unitService.findAll.mockResolvedValue({ items: [], total: 0 });

      const query = { page: 1, size: 10 };
      await service.findAvailableConversionUnits('mat-slug-1', query);

      expect(unitService.findAll).toHaveBeenCalledWith(query, ['unit-id-1', 'unit-id-9']);
    });

    it('không loại gì khi vật tư chưa gắn đơn vị nào', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      materialUnitRepository.find.mockResolvedValue([]);
      unitService.findAll.mockResolvedValue({ items: [], total: 0 });

      const query = { page: 1, size: 10 };
      await service.findAvailableConversionUnits('mat-slug-1', query);

      expect(unitService.findAll).toHaveBeenCalledWith(query, []);
    });

    it('ném MATERIAL_NOT_FOUND khi slug vật tư sai', async () => {
      materialRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.findAvailableConversionUnits('missing-slug', { page: 1, size: 10 }),
        MaterialValidation.MATERIAL_NOT_FOUND.code,
      );
      expect(unitService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('findConversionUnits — danh sách đã gắn', () => {
    it('phẳng hoá unit kèm conversionRate', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      materialUnitRepository.findAndCount.mockResolvedValue([
        [
          {
            materialId: 'material-id-1',
            unitId: 'unit-id-9',
            conversionRate: 50,
            unit: unit({ id: 'unit-id-9', slug: 'unit-slug-9', code: 'BAO', name: 'Bao 50kg' }),
          },
        ],
        1,
      ]);

      const result = await service.findConversionUnits('mat-slug-1', { page: 1, size: 10 });

      expect(result.items[0]).toEqual({
        unitSlug: 'unit-slug-9',
        unitCode: 'BAO',
        unitName: 'Bao 50kg',
        conversionRate: 50,
        isBaseUnit: false,
      });
      expect(result.total).toBe(1);
    });
  });

  describe('addConversionUnit', () => {
    const attachDto = { unitSlug: 'unit-slug-9', conversionRate: 50 };
    const conversionUnit = () =>
      unit({ id: 'unit-id-9', slug: 'unit-slug-9', code: 'BAO', name: 'Bao 50kg' });

    it('gắn unit và trả về dòng vừa tạo', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(conversionUnit());
      materialUnitRepository.countBy.mockResolvedValue(0);
      materialUnitRepository.create.mockImplementation((data) => data);
      materialUnitRepository.save.mockImplementation((data) => ({ ...data }));

      const result = await service.addConversionUnit('mat-slug-1', attachDto);

      expect(materialUnitRepository.save).toHaveBeenCalledWith({
        materialId: 'material-id-1',
        unitId: 'unit-id-9',
        conversionRate: 50,
      });
      expect(result).toEqual({
        unitSlug: 'unit-slug-9',
        unitCode: 'BAO',
        unitName: 'Bao 50kg',
        conversionRate: 50,
        isBaseUnit: false,
      });
    });

    // conversionRate đếm theo đơn vị cơ sở ⇒ chưa có base unit thì con số đó không có mốc để hiểu.
    it('chặn khi vật tư chưa khai đơn vị cơ sở', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());

      await expectError(
        service.addConversionUnit('mat-slug-1', attachDto),
        MaterialValidation.MATERIAL_BASE_UNIT_IS_REQUIRED.code,
      );
      expect(unitService.findEntityBySlug).not.toHaveBeenCalled();
    });

    // Đơn vị cơ sở nay cũng là 1 dòng của bảng join ⇒ gắn lại nó chỉ là trùng lặp.
    it('gắn lại chính đơn vị cơ sở ⇒ báo trùng', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(unit());
      materialUnitRepository.countBy.mockResolvedValue(1);

      await expectError(
        service.addConversionUnit('mat-slug-1', { ...attachDto, unitSlug: 'unit-slug-1' }),
        MaterialValidation.MATERIAL_CONVERSION_UNIT_DOES_EXIST.code,
      );
      expect(materialUnitRepository.save).not.toHaveBeenCalled();
    });

    it('chặn khi unit đã được gắn trước đó', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(conversionUnit());
      materialUnitRepository.countBy.mockResolvedValue(1);

      await expectError(
        service.addConversionUnit('mat-slug-1', attachDto),
        MaterialValidation.MATERIAL_CONVERSION_UNIT_DOES_EXIST.code,
      );
      expect(materialUnitRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateConversionUnit — partial (PATCH)', () => {
    const attachedRow = () => ({
      materialId: 'material-id-1',
      unitId: 'unit-id-9',
      conversionRate: 50,
      unit: unit({ id: 'unit-id-9', slug: 'unit-slug-9', code: 'BAO', name: 'Bao 50kg' }),
    });

    it('đổi conversionRate, giữ nguyên thông tin đơn vị', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-9', slug: 'unit-slug-9' }),
      );
      materialUnitRepository.findOne.mockResolvedValue(attachedRow());
      materialUnitRepository.save.mockImplementation((data) => data);

      const result = await service.updateConversionUnit('mat-slug-1', 'unit-slug-9', {
        conversionRate: 25,
      });

      expect(result).toMatchObject({ conversionRate: 25, unitSlug: 'unit-slug-9' });
    });

    it('ném CONVERSION_UNIT_NOT_FOUND khi unit chưa được gắn', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-9', slug: 'unit-slug-9' }),
      );
      materialUnitRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.updateConversionUnit('mat-slug-1', 'unit-slug-9', { conversionRate: 25 }),
        MaterialValidation.MATERIAL_CONVERSION_UNIT_NOT_FOUND.code,
      );
    });
  });

  describe('convertQuantity', () => {
    const bao = () => unit({ id: 'unit-id-9', slug: 'unit-slug-9', code: 'BAO', name: 'Bao 50kg' });
    const withBaseUnit = () => baseMaterial({ baseUnit: unit() });

    it('quy đổi từ đơn vị quy đổi sang đơn vị cơ sở (5 BAO = 250 KG)', async () => {
      materialRepository.findOne.mockResolvedValue(withBaseUnit());
      unitService.findEntityBySlug
        .mockResolvedValueOnce(bao()) // from
        .mockResolvedValueOnce(unit()); // to = base unit
      // Đơn vị cơ sở cũng có dòng join riêng với rate = 1, không còn là trường hợp đặc biệt.
      materialUnitRepository.findOne
        .mockResolvedValueOnce({ conversionRate: 50 })
        .mockResolvedValueOnce({ conversionRate: 1 });

      const result = await service.convertQuantity('mat-slug-1', {
        quantity: 5,
        fromUnitSlug: 'unit-slug-9',
        toUnitSlug: 'unit-slug-1',
      });

      expect(result).toMatchObject({
        fromQuantity: 5,
        fromConversionRate: 50,
        toQuantity: 250,
        toConversionRate: 1,
        quantityInBaseUnit: 250,
        baseUnitCode: 'KG',
      });
    });

    it('quy đổi ngược từ đơn vị cơ sở về đơn vị quy đổi (250 KG = 5 BAO)', async () => {
      materialRepository.findOne.mockResolvedValue(withBaseUnit());
      unitService.findEntityBySlug
        .mockResolvedValueOnce(unit()) // from = base unit
        .mockResolvedValueOnce(bao()); // to
      materialUnitRepository.findOne
        .mockResolvedValueOnce({ conversionRate: 1 })
        .mockResolvedValueOnce({ conversionRate: 50 });

      const result = await service.convertQuantity('mat-slug-1', {
        quantity: 250,
        fromUnitSlug: 'unit-slug-1',
        toUnitSlug: 'unit-slug-9',
      });

      expect(result).toMatchObject({ quantityInBaseUnit: 250, toQuantity: 5 });
    });

    // Cả 2 đầu đều là đơn vị quy đổi ⇒ phải đi vòng qua đơn vị cơ sở: 2 THÙNG = 24 KG = 0.48 BAO.
    it('quy đổi giữa 2 đơn vị quy đổi qua đơn vị cơ sở', async () => {
      materialRepository.findOne.mockResolvedValue(withBaseUnit());
      unitService.findEntityBySlug
        .mockResolvedValueOnce(unit({ id: 'unit-id-8', slug: 'unit-slug-8', code: 'THUNG' }))
        .mockResolvedValueOnce(bao());
      materialUnitRepository.findOne
        .mockResolvedValueOnce({ conversionRate: 12 })
        .mockResolvedValueOnce({ conversionRate: 50 });

      const result = await service.convertQuantity('mat-slug-1', {
        quantity: 2,
        fromUnitSlug: 'unit-slug-8',
        toUnitSlug: 'unit-slug-9',
      });

      expect(result).toMatchObject({ quantityInBaseUnit: 24, toQuantity: 0.48 });
    });

    it('chặn khi vật tư chưa khai đơn vị cơ sở', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());

      await expectError(
        service.convertQuantity('mat-slug-1', {
          quantity: 5,
          fromUnitSlug: 'unit-slug-9',
          toUnitSlug: 'unit-slug-1',
        }),
        MaterialValidation.MATERIAL_BASE_UNIT_IS_REQUIRED.code,
      );
    });

    it('chặn unit có thật nhưng không thuộc vật tư này', async () => {
      materialRepository.findOne.mockResolvedValue(withBaseUnit());
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-7', slug: 'unit-slug-7', code: 'LIT' }),
      );
      materialUnitRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.convertQuantity('mat-slug-1', {
          quantity: 5,
          fromUnitSlug: 'unit-slug-7',
          toUnitSlug: 'unit-slug-1',
        }),
        MaterialValidation.MATERIAL_CONVERSION_UNIT_NOT_FOUND.code,
      );
    });

    // Dữ liệu ghi thẳng dưới DB có thể có rate = 0 ⇒ chia cho 0 ra Infinity nếu không chặn.
    it('chặn conversionRate <= 0 trong DB thay vì trả Infinity', async () => {
      materialRepository.findOne.mockResolvedValue(withBaseUnit());
      unitService.findEntityBySlug.mockResolvedValue(bao());
      materialUnitRepository.findOne.mockResolvedValue({ conversionRate: 0 });

      await expectError(
        service.convertQuantity('mat-slug-1', {
          quantity: 5,
          fromUnitSlug: 'unit-slug-9',
          toUnitSlug: 'unit-slug-9',
        }),
        MaterialValidation.MATERIAL_CONVERSION_RATE_INVALID.code,
      );
    });
  });

  describe('removeConversionUnit', () => {
    it('xoá CỨNG dòng bảng join', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-9', slug: 'unit-slug-9' }),
      );
      materialUnitRepository.findOne.mockResolvedValue({
        materialId: 'material-id-1',
        unitId: 'unit-id-9',
      });

      await expect(service.removeConversionUnit('mat-slug-1', 'unit-slug-9')).resolves.toBe(1);
      expect(materialUnitRepository.delete).toHaveBeenCalledWith({
        materialId: 'material-id-1',
        unitId: 'unit-id-9',
      });
    });

    it('ném CONVERSION_UNIT_NOT_FOUND khi unit chưa được gắn', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-9', slug: 'unit-slug-9' }),
      );
      materialUnitRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.removeConversionUnit('mat-slug-1', 'unit-slug-9'),
        MaterialValidation.MATERIAL_CONVERSION_UNIT_NOT_FOUND.code,
      );
      expect(materialUnitRepository.delete).not.toHaveBeenCalled();
    });
  });
});
