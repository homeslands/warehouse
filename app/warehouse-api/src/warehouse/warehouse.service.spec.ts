import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { IsNull, Not, OptimisticLockVersionMismatchError } from 'typeorm';
import { WarehouseService } from './warehouse.service';
import { WarehouseProfile } from './warehouse.mapper';
import { Warehouse } from './warehouse.entity';
import { WarehouseException } from './warehouse.exception';
import { WarehouseValidation } from './warehouse.validation';
import { UserService } from 'src/user/user.service';
import { RoleEnum } from 'src/role/role.enum';

const baseWarehouse = (overrides: Partial<Warehouse> = {}): Warehouse =>
  ({
    id: 'warehouse-id-1',
    slug: 'wh-slug-1',
    name: 'Kho Hà Nội 1',
    code: 'WH-HN-01',
    address: 'Số 1, Cầu Giấy, Hà Nội',
    isActive: true,
    version: 1,
    manager: null,
    ...overrides,
  }) as Warehouse;

const managerUser = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'user-id-1',
    slug: 'manager-slug-1',
    phonenumber: '0900000000',
    isActive: true,
    role: { name: RoleEnum.Manager },
    ...overrides,
  }) as never;

const createDto = () => ({
  name: 'Kho Hà Nội 1',
  code: 'WH-HN-01',
  address: 'Số 1, Cầu Giấy, Hà Nội',
});

/** Assert đúng mã lỗi nghiệp vụ, không chỉ đúng class exception. */
const expectWarehouseError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(WarehouseException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('WarehouseService', () => {
  let service: WarehouseService;
  const warehouseRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    softRemove: jest.fn(),
  };
  const userService = { findBySlug: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        WarehouseProfile,
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
        { provide: UserService, useValue: userService },
      ],
    }).compile();
    await module.init();

    service = module.get<WarehouseService>(WarehouseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWarehouse', () => {
    it('creates a warehouse when code and name are free', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue(null);
      warehouseRepository.create.mockImplementation((data) => data);
      warehouseRepository.save.mockImplementation((data) => ({ ...data, id: 'warehouse-id-1' }));

      const result = await service.createWarehouse(createDto());

      expect(result).toMatchObject({ name: 'Kho Hà Nội 1', code: 'WH-HN-01' });
      expect(warehouseRepository.save).toHaveBeenCalled();
    });

    it('normalizes code to upper case and trims text before saving', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue(null);
      warehouseRepository.create.mockImplementation((data) => data);
      warehouseRepository.save.mockImplementation((data) => data);

      await service.createWarehouse({
        name: '  Kho Hà Nội 1  ',
        code: ' wh-hn-01 ',
        address: '  Số 1  ',
      });

      expect(warehouseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'WH-HN-01', name: 'Kho Hà Nội 1', address: 'Số 1' }),
      );
    });

    it('throws when the code is taken by a live warehouse', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());

      await expectWarehouseError(
        service.createWarehouse(createDto()),
        WarehouseValidation.WAREHOUSE_CODE_DOES_EXIST.code,
      );
      expect(warehouseRepository.save).not.toHaveBeenCalled();
    });

    it('throws a distinct error when the code is held by a soft-deleted warehouse', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse({ deletedAt: new Date() }));

      await expectWarehouseError(
        service.createWarehouse(createDto()),
        WarehouseValidation.WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE.code,
      );
    });

    it('looks up the code including soft-deleted rows', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue(null);
      warehouseRepository.create.mockImplementation((data) => data);
      warehouseRepository.save.mockImplementation((data) => data);

      await service.createWarehouse(createDto());

      expect(warehouseRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'WH-HN-01' },
        withDeleted: true,
      });
    });

    it('throws when the name already exists', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());

      await expectWarehouseError(
        service.createWarehouse(createDto()),
        WarehouseValidation.WAREHOUSE_NAME_DOES_EXIST.code,
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      warehouseRepository.findAndCount.mockResolvedValue([[], 0]);
    });

    const whereOf = () => warehouseRepository.findAndCount.mock.calls[0][0].where;

    it('always loads the manager relation', async () => {
      await service.findAll({ page: 1, size: 10 });

      expect(warehouseRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: { manager: true },
          order: { createdAt: 'DESC' },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('filters by isActive, including the false case', async () => {
      await service.findAll({ page: 1, size: 10, isActive: false });

      expect(whereOf()).toEqual({ isActive: false });
    });

    it('filters by managerSlug through the relation', async () => {
      await service.findAll({ page: 1, size: 10, managerSlug: 'manager-slug-1' });

      expect(whereOf()).toEqual({ manager: { slug: 'manager-slug-1' } });
    });

    it('maps hasManager=false to IsNull and hasManager=true to Not(IsNull)', async () => {
      await service.findAll({ page: 1, size: 10, hasManager: false });
      expect(whereOf()).toEqual({ manager: IsNull() });

      warehouseRepository.findAndCount.mockClear();
      await service.findAll({ page: 1, size: 10, hasManager: true });
      expect(whereOf()).toEqual({ manager: Not(IsNull()) });
    });

    it('treats an unparseable hasManager as absent rather than false', async () => {
      // DTO trả nguyên chuỗi lạ cho `@IsBoolean` bắt; service không được coi nó là `false` và
      // lọc ngược tập dữ liệu.
      await service.findAll({ page: 1, size: 10, hasManager: 'notabool' } as never);

      expect(whereOf()).toEqual({});
    });

    it('ignores hasManager when managerSlug is given', async () => {
      await service.findAll({
        page: 1,
        size: 10,
        managerSlug: 'manager-slug-1',
        hasManager: false,
      });

      expect(whereOf()).toEqual({ manager: { slug: 'manager-slug-1' } });
    });

    it('computes pagination metadata and flattens the manager fields', async () => {
      warehouseRepository.findAndCount.mockResolvedValue([
        [baseWarehouse({ manager: managerUser() })],
        3,
      ]);

      const result = await service.findAll({ page: 2, size: 1 });

      expect(result).toMatchObject({
        total: 3,
        page: 2,
        pageSize: 1,
        totalPages: 3,
        hasNext: true,
        hasPrevios: true,
      });
      expect(result.items[0]).toMatchObject({
        version: 1,
        managerSlug: 'manager-slug-1',
        managerPhonenumber: '0900000000',
      });
    });
  });

  describe('findMine', () => {
    it('scopes to the current user id and ignores manager filters from the query', async () => {
      warehouseRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findMine('user-id-1', {
        page: 1,
        size: 10,
        managerSlug: 'someone-else',
        hasManager: false,
      } as never);

      expect(warehouseRepository.findAndCount.mock.calls[0][0].where).toEqual({
        manager: { id: 'user-id-1' },
      });
    });
  });

  describe('findOne', () => {
    it('throws when the warehouse is not found', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);

      await expectWarehouseError(
        service.findOne('missing-slug'),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });

    it('loads the manager relation', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());

      await service.findOne('wh-slug-1');

      expect(warehouseRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'wh-slug-1' },
        relations: { manager: true },
      });
    });
  });

  describe('updateWarehouse', () => {
    const updateDto = { ...createDto(), version: 4 };

    it('loads the row with an optimistic lock on the given version', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseRepository.save.mockImplementation((data) => data);

      await service.updateWarehouse('wh-slug-1', updateDto);

      expect(warehouseRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'wh-slug-1' },
        relations: { manager: true },
        lock: { mode: 'optimistic', version: 4 },
      });
    });

    it('skips the uniqueness re-check when code and name are unchanged', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseRepository.save.mockImplementation((data) => data);

      await service.updateWarehouse('wh-slug-1', updateDto);

      expect(warehouseRepository.findOne).toHaveBeenCalledTimes(1);
      expect(warehouseRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('re-checks uniqueness when the code changes', async () => {
      warehouseRepository.findOne
        .mockResolvedValueOnce(baseWarehouse())
        .mockResolvedValueOnce(baseWarehouse({ id: 'other', code: 'WH-HN-02' }));

      await expectWarehouseError(
        service.updateWarehouse('wh-slug-1', { ...updateDto, code: 'WH-HN-02' }),
        WarehouseValidation.WAREHOUSE_CODE_DOES_EXIST.code,
      );
    });

    it('re-checks uniqueness when the name changes', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse({ id: 'other' }));

      await expectWarehouseError(
        service.updateWarehouse('wh-slug-1', { ...updateDto, name: 'Kho khác' }),
        WarehouseValidation.WAREHOUSE_NAME_DOES_EXIST.code,
      );
    });

    it('lets an optimistic lock mismatch propagate to the global filter', async () => {
      warehouseRepository.findOne.mockRejectedValue(
        new OptimisticLockVersionMismatchError('Warehouse', 9, 4),
      );

      await expect(service.updateWarehouse('wh-slug-1', updateDto)).rejects.toBeInstanceOf(
        OptimisticLockVersionMismatchError,
      );
    });

    it('throws when the warehouse is not found', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);

      await expectWarehouseError(
        service.updateWarehouse('missing-slug', updateDto),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });
  });

  describe('assignManager', () => {
    beforeEach(() => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseRepository.save.mockImplementation((data) => data);
    });

    it('assigns an active MANAGER user', async () => {
      userService.findBySlug.mockResolvedValue(managerUser());

      const result = await service.assignManager('wh-slug-1', {
        managerSlug: 'manager-slug-1',
        version: 1,
      });

      expect(warehouseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ manager: expect.objectContaining({ id: 'user-id-1' }) }),
      );
      expect(result.managerSlug).toBe('manager-slug-1');
    });

    it('unassigns without looking the user up when managerSlug is null', async () => {
      const result = await service.assignManager('wh-slug-1', { managerSlug: null, version: 1 });

      expect(userService.findBySlug).not.toHaveBeenCalled();
      expect(warehouseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ manager: null }),
      );
      expect(result.managerSlug).toBeUndefined();
    });

    it('throws when the target user does not exist', async () => {
      userService.findBySlug.mockResolvedValue(null);

      await expectWarehouseError(
        service.assignManager('wh-slug-1', { managerSlug: 'ghost', version: 1 }),
        WarehouseValidation.WAREHOUSE_MANAGER_NOT_FOUND.code,
      );
    });

    it('throws when the target user is inactive', async () => {
      userService.findBySlug.mockResolvedValue(managerUser({ isActive: false }));

      await expectWarehouseError(
        service.assignManager('wh-slug-1', { managerSlug: 'manager-slug-1', version: 1 }),
        WarehouseValidation.WAREHOUSE_MANAGER_INACTIVE.code,
      );
    });

    it('throws when the target user is not a MANAGER', async () => {
      userService.findBySlug.mockResolvedValue(
        managerUser({ role: { name: RoleEnum.Supervisor } }),
      );

      await expectWarehouseError(
        service.assignManager('wh-slug-1', { managerSlug: 'manager-slug-1', version: 1 }),
        WarehouseValidation.WAREHOUSE_MANAGER_ROLE_INVALID.code,
      );
      expect(warehouseRepository.save).not.toHaveBeenCalled();
    });

    it('loads the row with an optimistic lock on the given version', async () => {
      await service.assignManager('wh-slug-1', { managerSlug: null, version: 7 });

      expect(warehouseRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'wh-slug-1' },
        relations: { manager: true },
        lock: { mode: 'optimistic', version: 7 },
      });
    });

    it('throws when the warehouse is not found', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);

      await expectWarehouseError(
        service.assignManager('missing-slug', { managerSlug: null, version: 1 }),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });
  });

  describe('deleteWarehouse', () => {
    it('refuses to delete a warehouse that is still active', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse({ isActive: true }));

      await expectWarehouseError(
        service.deleteWarehouse('wh-slug-1'),
        WarehouseValidation.WAREHOUSE_ACTIVE_CANNOT_BE_DELETED.code,
      );
      expect(warehouseRepository.softRemove).not.toHaveBeenCalled();
    });

    it('soft removes an inactive warehouse', async () => {
      const warehouse = baseWarehouse({ isActive: false });
      warehouseRepository.findOneBy.mockResolvedValue(warehouse);

      await expect(service.deleteWarehouse('wh-slug-1')).resolves.toBe(1);
      expect(warehouseRepository.softRemove).toHaveBeenCalledWith(warehouse);
    });

    it('throws when the warehouse is not found', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectWarehouseError(
        service.deleteWarehouse('missing-slug'),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });
  });
});
