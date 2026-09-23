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
import { UnitService } from 'src/unit/unit.service';
import { Unit } from 'src/unit/unit.entity';
import { MaterialType } from 'src/material-type/material-type.entity';
import { WarehouseMaterial } from 'src/warehouse-material/warehouse-material.entity';

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
    version: 1,
    ...overrides,
  }) as Material;

const createDto = (overrides: Record<string, unknown> = {}) => ({
  code: 'MAT-001',
  name: 'Găng tay cao su',
  typeSlug: 'type-slug-1',
  minimumInventory: 10,
  maximumInventory: 100,
  ...overrides,
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
  const warehouseMaterialRepository = { countBy: jest.fn() };
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialService,
        MaterialProfile,
        { provide: getRepositoryToken(Material), useValue: materialRepository },
        { provide: getRepositoryToken(WarehouseMaterial), useValue: warehouseMaterialRepository },
        { provide: getRepositoryToken(MaterialUnit), useValue: materialUnitRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
        { provide: MaterialTypeService, useValue: materialTypeService },
        { provide: UnitService, useValue: unitService },
      ],
    }).compile();
    await module.init();

    service = module.get<MaterialService>(MaterialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMaterial', () => {
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
      expect(result).toMatchObject({ typeSlug: 'type-slug-1', typeCode: 'MT-01' });
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

  // PATCH phải là partial update đúng nghĩa REST: field không gửi giữ nguyên giá trị cũ.
  describe('updateMaterial — partial (PATCH)', () => {
    it('chỉ đổi field được gửi, các field khác giữ nguyên', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      materialRepository.save.mockImplementation((data) => data);

      const result = await service.updateMaterial('mat-slug-1', {
        name: 'Găng tay nitrile',
        version: 1,
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
        version: 1,
      } as never);

      expect(result).toMatchObject({ minimumInventory: 10, maximumInventory: 100 });
    });

    // Tra `findEntityBySlug(undefined)` sẽ ném `MATERIAL_TYPE_NOT_FOUND` oan.
    it('không tra lại materialType khi PATCH không gửi typeSlug', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      materialRepository.save.mockImplementation((data) => data);

      await service.updateMaterial('mat-slug-1', { name: 'Tên mới', version: 1 } as never);

      expect(materialTypeService.findEntityBySlug).not.toHaveBeenCalled();
    });

    // Ngưỡng phải so trên giá trị SAU khi ghép, không phải trên mỗi phần client gửi.
    it('chặn khi minimumInventory mới vượt maximumInventory đang có trong DB', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());

      await expectError(
        service.updateMaterial('mat-slug-1', { minimumInventory: 999, version: 1 } as never),
        MaterialValidation.MATERIAL_INVENTORY_RANGE_INVALID.code,
      );
    });
  });

  describe('deleteMaterial', () => {
    it('refuses to delete a material still assigned to a warehouse', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      warehouseMaterialRepository.countBy.mockResolvedValue(1);

      await expectError(
        service.deleteMaterial('mat-slug-1'),
        MaterialValidation.MATERIAL_IN_USE.code,
      );
      expect(materialRepository.softRemove).not.toHaveBeenCalled();
    });

    it('soft removes a material assigned to no warehouse', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      warehouseMaterialRepository.countBy.mockResolvedValue(0);

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
      expect(result).toMatchObject({ baseUnitSlug: 'unit-slug-1', baseUnitCode: 'KG' });
    });

    it('không tra unit khi tạo mới mà không gửi baseUnitSlug', async () => {
      materialRepository.findOne.mockResolvedValue(null);
      materialTypeService.findEntityBySlug.mockResolvedValue(materialType());
      materialRepository.create.mockImplementation((data) => data);
      materialRepository.save.mockImplementation((data) => data);

      await service.createMaterial(createDto());

      expect(unitService.findEntityBySlug).not.toHaveBeenCalled();
    });

    it('không tra unit khi PATCH không gửi baseUnitSlug', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      materialRepository.save.mockImplementation((data) => data);

      const result = await service.updateMaterial('mat-slug-1', { name: 'Tên mới', version: 1 });

      expect(unitService.findEntityBySlug).not.toHaveBeenCalled();
      expect(materialUnitRepository.countBy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ baseUnitSlug: 'unit-slug-1' });
    });

    // Rào "1 unit chỉ được làm base HOẶC đơn vị quy đổi của cùng 1 vật tư" — DB không biểu diễn
    // được bằng index nào nên nó phải sống ở service.
    it('từ chối đặt base unit đang là đơn vị quy đổi của chính vật tư đó', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      unitService.findEntityBySlug.mockResolvedValue(unit());
      materialUnitRepository.countBy.mockResolvedValue(1);

      await expectError(
        service.updateMaterial('mat-slug-1', { baseUnitSlug: 'unit-slug-1', version: 1 }),
        MaterialValidation.MATERIAL_BASE_UNIT_IS_CONVERSION_UNIT.code,
      );
      expect(materialUnitRepository.countBy).toHaveBeenCalledWith({
        materialId: 'material-id-1',
        unitId: 'unit-id-1',
      });
      expect(materialRepository.save).not.toHaveBeenCalled();
    });

    it('đổi base unit khi unit đó chưa phải đơn vị quy đổi', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial());
      unitService.findEntityBySlug.mockResolvedValue(unit());
      materialUnitRepository.countBy.mockResolvedValue(0);
      materialRepository.save.mockImplementation((data) => data);

      const result = await service.updateMaterial('mat-slug-1', {
        baseUnitSlug: 'unit-slug-1',
        version: 1,
      });

      expect(result).toMatchObject({ baseUnitSlug: 'unit-slug-1', baseUnitName: 'Kilogram' });
    });
  });

  describe('findAvailableConversionUnits', () => {
    it('loại cả đơn vị cơ sở lẫn các unit đã gắn', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      materialUnitRepository.find.mockResolvedValue([{ unitId: 'unit-id-9' }]);
      unitService.findAll.mockResolvedValue({ items: [], total: 0 });

      const query = { page: 1, size: 10 };
      await service.findAvailableConversionUnits('mat-slug-1', query);

      expect(unitService.findAll).toHaveBeenCalledWith(query, ['unit-id-1', 'unit-id-9']);
    });

    it('chỉ loại unit đã gắn khi vật tư chưa khai đơn vị cơ sở', async () => {
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
    it('phẳng hoá unit kèm conversionRate/quantity', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      materialUnitRepository.findAndCount.mockResolvedValue([
        [
          {
            materialId: 'material-id-1',
            unitId: 'unit-id-9',
            conversionRate: 50,
            quantity: 2,
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
        quantity: 2,
      });
      expect(result.total).toBe(1);
    });
  });

  describe('addConversionUnit', () => {
    const attachDto = { unitSlug: 'unit-slug-9', conversionRate: 50, quantity: 2 };
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
        quantity: 2,
      });
      expect(result).toEqual({
        unitSlug: 'unit-slug-9',
        unitCode: 'BAO',
        unitName: 'Bao 50kg',
        conversionRate: 50,
        quantity: 2,
      });
    });

    it('mặc định quantity = 1 khi client không gửi', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(conversionUnit());
      materialUnitRepository.countBy.mockResolvedValue(0);
      materialUnitRepository.create.mockImplementation((data) => data);
      materialUnitRepository.save.mockImplementation((data) => ({ ...data }));

      await service.addConversionUnit('mat-slug-1', {
        unitSlug: 'unit-slug-9',
        conversionRate: 50,
      });

      expect(materialUnitRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 1 }),
      );
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

    it('chặn khi unit được gắn chính là đơn vị cơ sở', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(unit());

      await expectError(
        service.addConversionUnit('mat-slug-1', { ...attachDto, unitSlug: 'unit-slug-1' }),
        MaterialValidation.MATERIAL_BASE_UNIT_IS_CONVERSION_UNIT.code,
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
      quantity: 2,
      unit: unit({ id: 'unit-id-9', slug: 'unit-slug-9', code: 'BAO', name: 'Bao 50kg' }),
    });

    it('không reset quantity khi PATCH chỉ gửi conversionRate', async () => {
      materialRepository.findOne.mockResolvedValue(baseMaterial({ baseUnit: unit() }));
      unitService.findEntityBySlug.mockResolvedValue(
        unit({ id: 'unit-id-9', slug: 'unit-slug-9' }),
      );
      materialUnitRepository.findOne.mockResolvedValue(attachedRow());
      materialUnitRepository.save.mockImplementation((data) => data);

      const result = await service.updateConversionUnit('mat-slug-1', 'unit-slug-9', {
        conversionRate: 25,
      });

      expect(result).toMatchObject({ conversionRate: 25, quantity: 2 });
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
