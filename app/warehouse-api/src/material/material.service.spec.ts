import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MaterialService } from './material.service';
import { MaterialProfile } from './material.mapper';
import { Material } from './material.entity';
import { MaterialException } from './material.exception';
import { MaterialValidation } from './material.validation';
import { MaterialTypeService } from 'src/material-type/material-type.service';
import { MaterialType } from 'src/material-type/material-type.entity';
import { WarehouseMaterial } from 'src/warehouse-material/warehouse-material.entity';

const materialType = () =>
  ({ id: 'type-id-1', slug: 'type-slug-1', code: 'MT-01', name: 'Tiêu hao' }) as MaterialType;

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
  const materialTypeService = { findEntityBySlug: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialService,
        MaterialProfile,
        { provide: getRepositoryToken(Material), useValue: materialRepository },
        { provide: getRepositoryToken(WarehouseMaterial), useValue: warehouseMaterialRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
        { provide: MaterialTypeService, useValue: materialTypeService },
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
});
