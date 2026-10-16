import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MaterialTypeService } from './material-type.service';
import { SortOrder } from 'src/app/base.dto';
import { MaterialTypeProfile } from './material-type.mapper';
import { MaterialType } from './material-type.entity';
import { MaterialTypeException } from './material-type.exception';
import { MaterialTypeValidation } from './material-type.validation';
import { Material } from 'src/material/material.entity';

const baseType = (overrides: Partial<MaterialType> = {}): MaterialType =>
  ({
    id: 'type-id-1',
    slug: 'type-slug-1',
    name: 'Vật tư tiêu hao',
    code: 'MT-01',
    ...overrides,
  }) as MaterialType;

/** Assert đúng mã lỗi nghiệp vụ, không chỉ đúng class exception. */
const expectError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(MaterialTypeException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('MaterialTypeService', () => {
  let service: MaterialTypeService;
  const materialTypeRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    softRemove: jest.fn(),
  };
  const materialRepository = { countBy: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialTypeService,
        MaterialTypeProfile,
        { provide: getRepositoryToken(MaterialType), useValue: materialTypeRepository },
        { provide: getRepositoryToken(Material), useValue: materialRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();

    service = module.get<MaterialTypeService>(MaterialTypeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMaterialType', () => {
    it('normalizes code to upper case and trims text before saving', async () => {
      materialTypeRepository.findOne.mockResolvedValue(null);
      materialTypeRepository.findOneBy.mockResolvedValue(null);
      materialTypeRepository.create.mockImplementation((data) => data);
      materialTypeRepository.save.mockImplementation((data) => data);

      await service.createMaterialType({
        name: '  Vật tư tiêu hao  ',
        code: ' mt-01 ',
        description: '  ghi chú  ',
      });

      expect(materialTypeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Vật tư tiêu hao', code: 'MT-01', description: 'ghi chú' }),
      );
    });

    it('rejects a code already taken by a live record', async () => {
      materialTypeRepository.findOne.mockResolvedValue(baseType());

      await expectError(
        service.createMaterialType({ name: 'x', code: 'MT-01' }),
        MaterialTypeValidation.MATERIAL_TYPE_CODE_DOES_EXIST.code,
      );
    });

    // UNIQUE index không bỏ qua soft-delete: phải phân biệt 2 tình huống thay vì để MySQL ném 500.
    it('reports a different error when the code is held by a soft-deleted record', async () => {
      materialTypeRepository.findOne.mockResolvedValue(baseType({ deletedAt: new Date() }));

      await expectError(
        service.createMaterialType({ name: 'x', code: 'MT-01' }),
        MaterialTypeValidation.MATERIAL_TYPE_CODE_RESERVED_BY_DELETED.code,
      );
    });

    it('rejects a duplicated name', async () => {
      materialTypeRepository.findOne.mockResolvedValue(null);
      materialTypeRepository.findOneBy.mockResolvedValue(baseType());

      await expectError(
        service.createMaterialType({ name: 'Vật tư tiêu hao', code: 'MT-02' }),
        MaterialTypeValidation.MATERIAL_TYPE_NAME_DOES_EXIST.code,
      );
    });
  });

  describe('findAll', () => {
    it('filters createdAt by startDate / endDate, date-only endDate covers the whole day', async () => {
      materialTypeRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        page: 1,
        size: 10,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      const { where } = materialTypeRepository.findAndCount.mock.calls[0][0];
      const [from, to] = where.createdAt.value;
      expect(from).toMatchObject({ _type: 'moreThanOrEqual', _value: new Date(2026, 8, 1) });
      expect(to).toMatchObject({ _type: 'lessThan', _value: new Date(2026, 9, 1) });
    });

    it('does not filter createdAt when no date is given', async () => {
      materialTypeRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, size: 10 });

      const { where } = materialTypeRepository.findAndCount.mock.calls[0][0];
      expect(where).not.toHaveProperty('createdAt');
    });

    it.each([
      [undefined, SortOrder.DESC],
      [SortOrder.ASC, SortOrder.ASC],
    ])('orders by createdAt %s (default DESC), id ASC as tie-breaker', async (sort, expected) => {
      materialTypeRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, size: 10, sort });

      const { order } = materialTypeRepository.findAndCount.mock.calls[0][0];
      expect(order).toEqual({ createdAt: expected, id: 'ASC' });
    });

    it('rejects startDate after endDate', async () => {
      await expectError(
        service.findAll({ page: 1, size: 10, startDate: '2026-09-30', endDate: '2026-09-01' }),
        MaterialTypeValidation.MATERIAL_TYPE_DATE_RANGE_INVALID.code,
      );
      expect(materialTypeRepository.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('deleteMaterialType', () => {
    it('refuses to delete a type still referenced by materials', async () => {
      materialTypeRepository.findOneBy.mockResolvedValue(baseType());
      materialRepository.countBy.mockResolvedValue(2);

      await expectError(
        service.deleteMaterialType('type-slug-1'),
        MaterialTypeValidation.MATERIAL_TYPE_IN_USE.code,
      );
      expect(materialTypeRepository.softRemove).not.toHaveBeenCalled();
    });

    it('soft removes a type with no material referencing it', async () => {
      materialTypeRepository.findOneBy.mockResolvedValue(baseType());
      materialRepository.countBy.mockResolvedValue(0);

      await expect(service.deleteMaterialType('type-slug-1')).resolves.toBe(1);
      expect(materialTypeRepository.softRemove).toHaveBeenCalled();
    });

    it('throws NOT_FOUND for an unknown slug', async () => {
      materialTypeRepository.findOneBy.mockResolvedValue(null);

      await expectError(
        service.deleteMaterialType('nope'),
        MaterialTypeValidation.MATERIAL_TYPE_NOT_FOUND.code,
      );
    });
  });
});
