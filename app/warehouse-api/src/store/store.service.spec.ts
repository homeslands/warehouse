import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { StoreService } from './store.service';
import { StoreProfile } from './store.mapper';
import { Store } from './store.entity';
import { StoreException } from './store.exception';
import { StoreValidation } from './store.validation';

const baseStore = (overrides: Partial<Store> = {}): Store =>
  ({
    id: 'store-id-1',
    slug: 'st-slug-1',
    name: 'Cửa hàng Hà Nội 1',
    code: 'ST-HN-01',
    legalName: 'Công ty TNHH ABC',
    taxCode: '0101234567',
    isActive: true,
    version: 1,
    ...overrides,
  }) as Store;

const createDto = () => ({
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
});

/** Assert đúng mã lỗi nghiệp vụ, không chỉ đúng class exception. */
const expectStoreError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(StoreException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('StoreService', () => {
  let service: StoreService;
  const storeRepository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    softRemove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreService,
        StoreProfile,
        { provide: getRepositoryToken(Store), useValue: storeRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();

    service = module.get<StoreService>(StoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createStore', () => {
    it('creates a store when code, name and taxCode are free', async () => {
      storeRepository.findOne.mockResolvedValue(null);
      storeRepository.findOneBy.mockResolvedValue(null);
      storeRepository.create.mockImplementation((data) => data);
      storeRepository.save.mockImplementation((data) => ({ ...data, id: 'store-id-1' }));

      const result = await service.createStore(createDto());

      expect(result).toMatchObject({
        name: 'Cửa hàng Hà Nội 1',
        code: 'ST-HN-01',
        legalName: 'Công ty TNHH ABC',
        taxCode: '0101234567',
      });
      expect(storeRepository.save).toHaveBeenCalled();
    });

    it('upper-cases the code, lower-cases the email and trims text before saving', async () => {
      storeRepository.findOne.mockResolvedValue(null);
      storeRepository.findOneBy.mockResolvedValue(null);
      storeRepository.create.mockImplementation((data) => data);
      storeRepository.save.mockImplementation((data) => data);

      await service.createStore({
        name: '  Cửa hàng Hà Nội 1  ',
        code: ' st-hn-01 ',
        legalName: '  Công ty TNHH ABC  ',
        taxCode: ' 0101234567 ',
        email: '  LienHe@ABC.VN  ',
        address: '  Số 2  ',
      });

      expect(storeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ST-HN-01',
          name: 'Cửa hàng Hà Nội 1',
          legalName: 'Công ty TNHH ABC',
          taxCode: '0101234567',
          email: 'lienhe@abc.vn',
          address: 'Số 2',
        }),
      );
    });

    it('throws when the code is taken by a live store', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());

      await expectStoreError(
        service.createStore(createDto()),
        StoreValidation.STORE_CODE_DOES_EXIST.code,
      );
      expect(storeRepository.save).not.toHaveBeenCalled();
    });

    it('throws a distinct error when the code is held by a soft-deleted store', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore({ deletedAt: new Date() }));

      await expectStoreError(
        service.createStore(createDto()),
        StoreValidation.STORE_CODE_RESERVED_BY_DELETED_STORE.code,
      );
    });

    it('looks up the code including soft-deleted rows', async () => {
      storeRepository.findOne.mockResolvedValue(null);
      storeRepository.findOneBy.mockResolvedValue(null);
      storeRepository.create.mockImplementation((data) => data);
      storeRepository.save.mockImplementation((data) => data);

      await service.createStore(createDto());

      expect(storeRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'ST-HN-01' },
        withDeleted: true,
      });
    });

    it('throws when the name already exists', async () => {
      storeRepository.findOne.mockResolvedValue(null);
      storeRepository.findOneBy.mockResolvedValue(baseStore());

      await expectStoreError(
        service.createStore(createDto()),
        StoreValidation.STORE_NAME_DOES_EXIST.code,
      );
    });

    it('throws when the taxCode already exists', async () => {
      storeRepository.findOne.mockResolvedValue(null);
      // 1st findOneBy = name check (free), 2nd = taxCode check (taken).
      storeRepository.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(baseStore());

      await expectStoreError(
        service.createStore(createDto()),
        StoreValidation.STORE_TAX_CODE_DOES_EXIST.code,
      );
      expect(storeRepository.save).not.toHaveBeenCalled();
    });

    it('checks the taxCode among live rows only, unlike the code check', async () => {
      storeRepository.findOne.mockResolvedValue(null);
      storeRepository.findOneBy.mockResolvedValue(null);
      storeRepository.create.mockImplementation((data) => data);
      storeRepository.save.mockImplementation((data) => data);

      await service.createStore(createDto());

      expect(storeRepository.findOneBy).toHaveBeenCalledWith({ taxCode: '0101234567' });
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      storeRepository.findAndCount.mockResolvedValue([[], 0]);
    });

    const whereOf = () => storeRepository.findAndCount.mock.calls[0][0].where;

    it('orders by createdAt DESC and applies pagination', async () => {
      await service.findAll({ page: 1, size: 10 });

      expect(storeRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' }, skip: 0, take: 10 }),
      );
    });

    it('filters by isActive, including the false case', async () => {
      await service.findAll({ page: 1, size: 10, isActive: false });

      expect(whereOf()).toEqual({ isActive: false });
    });

    it('treats an unparseable isActive as absent rather than false', async () => {
      // DTO trả nguyên chuỗi lạ cho `@IsBoolean` bắt; service không được coi nó là `false` và lọc
      // ngược tập dữ liệu.
      await service.findAll({ page: 1, size: 10, isActive: 'notabool' } as never);

      expect(whereOf()).toEqual({});
    });

    it('computes pagination metadata and exposes version', async () => {
      storeRepository.findAndCount.mockResolvedValue([[baseStore()], 3]);

      const result = await service.findAll({ page: 2, size: 1 });

      expect(result).toMatchObject({
        total: 3,
        page: 2,
        pageSize: 1,
        totalPages: 3,
        hasNext: true,
        hasPrevios: true,
      });
      expect(result.items[0]).toMatchObject({ slug: 'st-slug-1', version: 1 });
    });
  });

  describe('findOne', () => {
    it('throws when the store is not found', async () => {
      storeRepository.findOneBy.mockResolvedValue(null);

      await expectStoreError(service.findOne('missing-slug'), StoreValidation.STORE_NOT_FOUND.code);
    });

    it('returns the mapped store', async () => {
      storeRepository.findOneBy.mockResolvedValue(baseStore());

      const result = await service.findOne('st-slug-1');

      expect(storeRepository.findOneBy).toHaveBeenCalledWith({ slug: 'st-slug-1' });
      expect(result).toMatchObject({ slug: 'st-slug-1', code: 'ST-HN-01', version: 1 });
    });
  });

  describe('updateStore', () => {
    const updateDto = { ...createDto(), version: 4 };

    it('loads the row with an optimistic lock on the given version', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      storeRepository.save.mockImplementation((data) => data);

      await service.updateStore('st-slug-1', updateDto);

      expect(storeRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'st-slug-1' },
        lock: { mode: 'optimistic', version: 4 },
      });
    });

    it('skips the uniqueness re-check when code, name and taxCode are unchanged', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      storeRepository.save.mockImplementation((data) => data);

      await service.updateStore('st-slug-1', updateDto);

      expect(storeRepository.findOne).toHaveBeenCalledTimes(1);
      expect(storeRepository.findOneBy).not.toHaveBeenCalled();
    });

    it('re-checks uniqueness when the code changes', async () => {
      storeRepository.findOne
        .mockResolvedValueOnce(baseStore())
        .mockResolvedValueOnce(baseStore({ id: 'other', code: 'ST-HN-02' }));

      await expectStoreError(
        service.updateStore('st-slug-1', { ...updateDto, code: 'ST-HN-02' }),
        StoreValidation.STORE_CODE_DOES_EXIST.code,
      );
    });

    it('re-checks uniqueness when the name changes', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      storeRepository.findOneBy.mockResolvedValue(baseStore({ id: 'other' }));

      await expectStoreError(
        service.updateStore('st-slug-1', { ...updateDto, name: 'Cửa hàng khác' }),
        StoreValidation.STORE_NAME_DOES_EXIST.code,
      );
    });

    it('re-checks uniqueness when the taxCode changes', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      storeRepository.findOneBy.mockResolvedValue(baseStore({ id: 'other' }));

      await expectStoreError(
        service.updateStore('st-slug-1', { ...updateDto, taxCode: '0109999999' }),
        StoreValidation.STORE_TAX_CODE_DOES_EXIST.code,
      );
    });

    it('lets an optimistic lock mismatch propagate to the global filter', async () => {
      storeRepository.findOne.mockRejectedValue(
        new OptimisticLockVersionMismatchError('Store', 9, 4),
      );

      await expect(service.updateStore('st-slug-1', updateDto)).rejects.toBeInstanceOf(
        OptimisticLockVersionMismatchError,
      );
    });

    it('throws when the store is not found', async () => {
      storeRepository.findOne.mockResolvedValue(null);

      await expectStoreError(
        service.updateStore('missing-slug', updateDto),
        StoreValidation.STORE_NOT_FOUND.code,
      );
    });
  });

  describe('deleteStore', () => {
    it('refuses to delete a store that is still active', async () => {
      storeRepository.findOneBy.mockResolvedValue(baseStore({ isActive: true }));

      await expectStoreError(
        service.deleteStore('st-slug-1'),
        StoreValidation.STORE_ACTIVE_CANNOT_BE_DELETED.code,
      );
      expect(storeRepository.softRemove).not.toHaveBeenCalled();
    });

    it('soft removes an inactive store', async () => {
      const store = baseStore({ isActive: false });
      storeRepository.findOneBy.mockResolvedValue(store);

      await expect(service.deleteStore('st-slug-1')).resolves.toBe(1);
      expect(storeRepository.softRemove).toHaveBeenCalledWith(store);
    });

    it('throws when the store is not found', async () => {
      storeRepository.findOneBy.mockResolvedValue(null);

      await expectStoreError(
        service.deleteStore('missing-slug'),
        StoreValidation.STORE_NOT_FOUND.code,
      );
    });
  });
});
