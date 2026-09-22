import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { UnitService } from './unit.service';
import { UnitProfile } from './unit.mapper';
import { Unit } from './unit.entity';
import { UnitException } from './unit.exception';
import { UnitValidation } from './unit.validation';
import { Material } from 'src/material/material.entity';

const baseUnit = (overrides: Partial<Unit> = {}): Unit =>
  ({
    id: 'unit-id-1',
    slug: 'unit-slug-1',
    name: 'Kilogram',
    code: 'KG',
    version: 1,
    ...overrides,
  }) as Unit;

/** Assert đúng mã lỗi nghiệp vụ, không chỉ đúng class exception. */
const expectError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(UnitException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('UnitService', () => {
  let service: UnitService;
  const unitRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    softRemove: jest.fn(),
  };
  const materialRepository = { count: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitService,
        UnitProfile,
        { provide: getRepositoryToken(Unit), useValue: unitRepository },
        { provide: getRepositoryToken(Material), useValue: materialRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();

    service = module.get<UnitService>(UnitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUnit', () => {
    it('creates a unit and upper-cases the business code', async () => {
      unitRepository.findOne.mockResolvedValue(null);
      unitRepository.findOneBy.mockResolvedValue(null);
      unitRepository.create.mockImplementation((data: Unit) => data);
      unitRepository.save.mockImplementation((data: Unit) => ({ ...baseUnit(), ...data }));

      const result = await service.createUnit({ name: '  Kilogram ', code: 'kg' });

      expect(unitRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Kilogram', code: 'KG' }),
      );
      expect(result).toMatchObject({ name: 'Kilogram', code: 'KG' });
    });

    it('rejects a code already taken by a live unit', async () => {
      unitRepository.findOne.mockResolvedValue(baseUnit());

      await expectError(
        service.createUnit({ name: 'Kilogram', code: 'KG' }),
        UnitValidation.UNIT_CODE_DOES_EXIST.code,
      );
    });

    it('distinguishes a code still held by a soft-deleted unit', async () => {
      unitRepository.findOne.mockResolvedValue(baseUnit({ deletedAt: new Date() }));

      await expectError(
        service.createUnit({ name: 'Kilogram', code: 'KG' }),
        UnitValidation.UNIT_CODE_RESERVED_BY_DELETED.code,
      );
    });

    it('rejects a duplicated name', async () => {
      unitRepository.findOne.mockResolvedValue(null);
      unitRepository.findOneBy.mockResolvedValue(baseUnit());

      await expectError(
        service.createUnit({ name: 'Kilogram', code: 'KG-2' }),
        UnitValidation.UNIT_NAME_DOES_EXIST.code,
      );
    });
  });

  describe('findOne', () => {
    it('throws when the unit is not found', async () => {
      unitRepository.findOneBy.mockResolvedValue(null);

      await expectError(service.findOne('missing-slug'), UnitValidation.UNIT_NOT_FOUND.code);
    });
  });

  describe('updateUnit — partial (PATCH)', () => {
    it('keeps untouched fields and never re-checks a field the client did not send', async () => {
      const existing = baseUnit({ description: 'Đơn vị khối lượng' });
      unitRepository.findOne.mockResolvedValue(existing);
      unitRepository.save.mockImplementation((data: Unit) => data);

      const result = await service.updateUnit('unit-slug-1', {
        description: 'Mô tả mới',
        version: 1,
      });

      // `findOne` chỉ được gọi 1 lần (load entity) — không có lần nào để check trùng code.
      expect(unitRepository.findOne).toHaveBeenCalledTimes(1);
      expect(unitRepository.findOneBy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ name: 'Kilogram', code: 'KG', description: 'Mô tả mới' });
    });

    it('loads the entity under an optimistic lock on the version sent by the client', async () => {
      unitRepository.findOne.mockResolvedValue(baseUnit());
      unitRepository.save.mockImplementation((data: Unit) => data);

      await service.updateUnit('unit-slug-1', { version: 3 });

      expect(unitRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'unit-slug-1' },
        lock: { mode: 'optimistic', version: 3 },
      });
    });

    it('rejects a new code already taken', async () => {
      unitRepository.findOne
        .mockResolvedValueOnce(baseUnit())
        .mockResolvedValueOnce(baseUnit({ id: 'unit-id-2', code: 'G' }));

      await expectError(
        service.updateUnit('unit-slug-1', { code: 'G', version: 1 }),
        UnitValidation.UNIT_CODE_DOES_EXIST.code,
      );
    });

    it('throws when the unit is not found', async () => {
      unitRepository.findOne.mockResolvedValue(null);

      await expectError(
        service.updateUnit('missing-slug', { version: 1 }),
        UnitValidation.UNIT_NOT_FOUND.code,
      );
    });
  });

  describe('deleteUnit', () => {
    it('soft-removes a unit no material refers to', async () => {
      unitRepository.findOneBy.mockResolvedValue(baseUnit());
      materialRepository.count.mockResolvedValue(0);

      await expect(service.deleteUnit('unit-slug-1')).resolves.toBe(1);
      expect(unitRepository.softRemove).toHaveBeenCalled();
    });

    // Xoá mềm nên FK của bảng join không chặn giúp — rào phải nằm ở service.
    it('refuses to delete a unit still referenced through material_unit_can_have_tbl', async () => {
      unitRepository.findOneBy.mockResolvedValue(baseUnit());
      materialRepository.count.mockResolvedValue(2);

      await expectError(service.deleteUnit('unit-slug-1'), UnitValidation.UNIT_IN_USE.code);
      expect(unitRepository.softRemove).not.toHaveBeenCalled();
    });
  });
});
