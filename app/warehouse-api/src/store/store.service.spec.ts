import { Test, TestingModule } from '@nestjs/testing';
import { RoleEnum } from 'src/role/role.enum';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { StoreService } from './store.service';
import { StoreProfile } from './store.mapper';
import { Store } from './store.entity';
import { StoreException } from './store.exception';
import { StoreValidation } from './store.validation';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { CurrentUserDto } from 'src/user/user.decorator';
import { StoreWarehouseHistory } from './store-warehouse-history.entity';
import { StoreWarehouseHistoryAction } from './store.constants';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';

const baseStore = (overrides: Partial<Store> = {}): Store =>
  ({
    id: 'store-id-1',
    slug: 'st-slug-1',
    name: 'Cửa hàng Hà Nội 1',
    code: 'ST-HN-01',
    legalName: 'Công ty TNHH ABC',
    taxCode: '0101234567',
    isActive: true,
    ...overrides,
  }) as Store;

const baseWarehouse = (overrides: Partial<Warehouse> = {}): Warehouse =>
  ({
    id: 'wh-id-1',
    slug: 'wh-slug-1',
    name: 'Kho Hà Nội',
    code: 'WH-HN-01',
    isActive: true,
    ...overrides,
  }) as Warehouse;

const createDto = () => ({
  name: 'Cửa hàng Hà Nội 1',
  code: 'ST-HN-01',
  legalName: 'Công ty TNHH ABC',
  taxCode: '0101234567',
});

const otherStoreFixture = (): Store => baseStore({ id: 'store-id-2', slug: 'st-slug-2' });

const savedHistoriesOf = (repository: { save: jest.Mock }) =>
  repository.save.mock.calls.map(([entry]) => entry);

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
    update: jest.fn(),
  };
  const warehouseRepository = {
    findOneBy: jest.fn(),
  };
  const historyRepository = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };
  // `applyWarehouse` lấy mọi repository qua `manager` của transaction.
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === Store
        ? storeRepository
        : entity === Warehouse
          ? warehouseRepository
          : historyRepository,
    ),
  };
  const transactionManager = {
    execute: jest.fn((onSave: (m: typeof manager) => Promise<unknown>) => onSave(manager)),
  };
  const actor: CurrentUserDto = { userId: 'user-id-1', roleName: 'ADMIN', scope: [] };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreService,
        StoreProfile,
        { provide: getRepositoryToken(Store), useValue: storeRepository },
        { provide: getRepositoryToken(StoreWarehouseHistory), useValue: historyRepository },
        { provide: TransactionManagerService, useValue: transactionManager },
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

    // Cửa hàng "thuộc về" MANAGER = cửa hàng gắn với kho mà MANAGER đó phụ trách.
    it('scopes a MANAGER to stores linked to warehouses they manage', async () => {
      const manager = { userId: 'user-id-1', roleName: RoleEnum.Manager, scope: [] };
      await service.findAll({ page: 1, size: 10, isActive: true }, manager);

      expect(whereOf()).toEqual({
        isActive: true,
        warehouse: { manager: { id: 'user-id-1' } },
      });
    });

    it.each([RoleEnum.Admin, RoleEnum.SuperAdmin, RoleEnum.Supervisor])(
      'does not scope %s',
      async (roleName) => {
        await service.findAll({ page: 1, size: 10 }, { userId: 'user-id-1', roleName, scope: [] });

        expect(whereOf()).toEqual({});
      },
    );

    it('computes pagination metadata', async () => {
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
      expect(result.items[0]).toMatchObject({ slug: 'st-slug-1' });
    });
  });

  describe('findOne', () => {
    it('throws when the store is not found', async () => {
      storeRepository.findOne.mockResolvedValue(null);

      await expectStoreError(service.findOne('missing-slug'), StoreValidation.STORE_NOT_FOUND.code);
    });

    it('returns the mapped store', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());

      const result = await service.findOne('st-slug-1');

      expect(storeRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'st-slug-1' },
        relations: { warehouse: true },
      });
      expect(result).toMatchObject({ slug: 'st-slug-1', code: 'ST-HN-01' });
    });

    // Quan hệ không `eager`: quên `relations` là response im lặng mất `warehouseSlug`.
    it('flattens the linked warehouse into warehouseSlug/warehouseName', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore({ warehouse: baseWarehouse() }));

      const result = await service.findOne('st-slug-1');

      expect(result).toMatchObject({ warehouseSlug: 'wh-slug-1', warehouseName: 'Kho Hà Nội' });
    });

    it('leaves warehouseSlug undefined when the store has no warehouse', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());

      const result = await service.findOne('st-slug-1');

      expect(result.warehouseSlug).toBeUndefined();
    });
  });

  describe('updateStore', () => {
    const updateDto = createDto();

    it('loads the row by slug', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      storeRepository.save.mockImplementation((data) => data);

      await service.updateStore('st-slug-1', updateDto);

      expect(storeRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'st-slug-1' },
        relations: { warehouse: true },
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

    // `Object.assign(store, data)` với `data` do automapper dựng: nếu `warehouse` lọt vào `data`
    // thì bản update thường sẽ âm thầm gỡ kho khỏi cửa hàng.
    it('keeps the linked warehouse untouched', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore({ warehouse: baseWarehouse() }));
      storeRepository.save.mockImplementation((data) => data);

      const result = await service.updateStore('st-slug-1', updateDto);

      expect(storeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ warehouse: expect.objectContaining({ id: 'wh-id-1' }) }),
      );
      expect(result).toMatchObject({ warehouseSlug: 'wh-slug-1' });
    });

    it('throws when the store is not found', async () => {
      storeRepository.findOne.mockResolvedValue(null);

      await expectStoreError(
        service.updateStore('missing-slug', updateDto),
        StoreValidation.STORE_NOT_FOUND.code,
      );
    });
  });

  // PATCH phải là partial update đúng nghĩa REST: field không gửi giữ nguyên giá trị cũ.
  describe('updateStore — partial (PATCH)', () => {
    beforeEach(() => {
      // `jest.clearAllMocks()` chỉ xoá lịch sử gọi, KHÔNG xoá implementation đã set ở test trước.
      storeRepository.findOneBy.mockResolvedValue(null);
    });

    it('chỉ đổi field được gửi, các field khác giữ nguyên', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      storeRepository.save.mockImplementation((data) => data);

      const result = await service.updateStore('st-slug-1', {
        name: 'Cửa hàng Hà Nội 2',
      } as never);

      expect(storeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Cửa hàng Hà Nội 2',
          code: 'ST-HN-01',
          legalName: 'Công ty TNHH ABC',
          taxCode: '0101234567',
        }),
      );
      expect(result).toMatchObject({ name: 'Cửa hàng Hà Nội 2', code: 'ST-HN-01' });
    });

    // Thiếu rào `undefined`, `assertCodeIsFree(undefined)` sẽ tra trúng một bản ghi bất kỳ và báo
    // trùng sai.
    it('không check trùng cho field không gửi', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      storeRepository.save.mockImplementation((data) => data);

      await service.updateStore('st-slug-1', { name: 'Tên mới' } as never);

      expect(storeRepository.findOne).toHaveBeenCalledTimes(1);
      expect(storeRepository.findOneBy).toHaveBeenCalledTimes(1);
      expect(storeRepository.findOneBy).toHaveBeenCalledWith({ name: 'Tên mới' });
    });

    // `PartialType` sao chép initializer `isActive = true` của DTO cha ⇒ nếu không huỷ, PATCH không
    // gửi `isActive` sẽ bật lại cửa hàng đã ngừng hoạt động.
    it('không tự bật lại isActive khi PATCH không gửi field đó', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore({ isActive: false }));
      storeRepository.save.mockImplementation((data) => data);

      const result = await service.updateStore('st-slug-1', {
        name: 'Tên mới',
      } as never);

      expect(result.isActive).toBe(false);
    });

    it('vẫn tắt được isActive khi gửi false tường minh', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore({ isActive: true }));
      storeRepository.save.mockImplementation((data) => data);

      const result = await service.updateStore('st-slug-1', {
        isActive: false,
      } as never);

      expect(result.isActive).toBe(false);
    });

    it('giữ nguyên quan hệ warehouse khi PATCH không nhắc tới nó', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore({ warehouse: baseWarehouse() }));
      storeRepository.save.mockImplementation((data) => data);

      const result = await service.updateStore('st-slug-1', {
        name: 'Tên mới',
      } as never);

      expect(result).toMatchObject({ warehouseSlug: 'wh-slug-1' });
    });
  });

  describe('assignWarehouse', () => {
    const assignDto = { warehouseSlug: 'wh-slug-1' };
    const otherStore = () => baseStore({ id: 'store-id-2', slug: 'st-slug-2' });
    /** Lần `findOne` 1 = cửa hàng đích, lần 2 = cửa hàng đang giữ kho. */
    const givenStores = (store: Store | null, holder: Store | null = null) =>
      storeRepository.findOne.mockResolvedValueOnce(store).mockResolvedValueOnce(holder);
    const savedHistories = () => historyRepository.save.mock.calls.map(([entry]) => entry);

    it('runs inside a transaction and locks the store row', async () => {
      givenStores(baseStore());
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());

      await service.assignWarehouse(actor, 'st-slug-1', assignDto);

      expect(transactionManager.execute).toHaveBeenCalledTimes(1);
      expect(storeRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { slug: 'st-slug-1' },
        relations: { warehouse: true },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('assigns a free warehouse, records ASSIGN and returns it flattened', async () => {
      givenStores(baseStore());
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());

      const result = await service.assignWarehouse(actor, 'st-slug-1', assignDto);

      expect(storeRepository.update).toHaveBeenCalledTimes(1);
      expect(storeRepository.update).toHaveBeenCalledWith(
        { id: 'store-id-1' },
        { warehouse: expect.objectContaining({ id: 'wh-id-1' }) },
      );
      expect(savedHistories()).toEqual([
        expect.objectContaining({
          action: StoreWarehouseHistoryAction.Assign,
          previousWarehouse: null,
          newWarehouse: expect.objectContaining({ id: 'wh-id-1' }),
          relatedStore: null,
          changedBy: { id: 'user-id-1' },
        }),
      ]);
      expect(result).toMatchObject({ warehouseSlug: 'wh-slug-1', warehouseName: 'Kho Hà Nội' });
    });

    it('records the warehouse it replaces as previousWarehouse', async () => {
      const old = baseWarehouse({ id: 'wh-id-0', slug: 'wh-slug-0' });
      givenStores(baseStore({ warehouse: old }));
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());

      await service.assignWarehouse(actor, 'st-slug-1', assignDto);

      expect(savedHistories()[0]).toMatchObject({
        action: StoreWarehouseHistoryAction.Assign,
        previousWarehouse: old,
      });
    });

    // `warehouseSlug: null` là đường gỡ gắn kết duy nhất — không có endpoint DELETE riêng.
    it('unassigns the warehouse when warehouseSlug is null and records UNASSIGN', async () => {
      const old = baseWarehouse();
      storeRepository.findOne.mockResolvedValue(baseStore({ warehouse: old }));

      const result = await service.assignWarehouse(actor, 'st-slug-1', { warehouseSlug: null });

      expect(warehouseRepository.findOneBy).not.toHaveBeenCalled();
      expect(storeRepository.update).toHaveBeenCalledWith(
        { id: 'store-id-1' },
        { warehouse: null },
      );
      expect(savedHistories()).toEqual([
        expect.objectContaining({
          action: StoreWarehouseHistoryAction.Unassign,
          previousWarehouse: old,
          newWarehouse: null,
        }),
      ]);
      expect(result.warehouseSlug).toBeUndefined();
    });

    // 1-1: kho đang thuộc cửa hàng khác bị gỡ khỏi cửa hàng đó TRƯỚC (thứ tự bắt buộc bởi
    // `UQ_store_warehouse`), cửa hàng mất kho có dòng `RELEASED` riêng để restore lại được.
    it('moves a warehouse held by another store: releases it first, then assigns', async () => {
      givenStores(baseStore(), otherStore());
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());

      await service.assignWarehouse(actor, 'st-slug-1', assignDto);

      expect(storeRepository.update.mock.calls).toEqual([
        [{ id: 'store-id-2' }, { warehouse: null }],
        [{ id: 'store-id-1' }, { warehouse: expect.objectContaining({ id: 'wh-id-1' }) }],
      ]);
      expect(savedHistories()).toEqual([
        expect.objectContaining({
          store: expect.objectContaining({ id: 'store-id-2' }),
          action: StoreWarehouseHistoryAction.Released,
          previousWarehouse: expect.objectContaining({ id: 'wh-id-1' }),
          newWarehouse: null,
          relatedStore: expect.objectContaining({ id: 'store-id-1' }),
        }),
        expect.objectContaining({
          store: expect.objectContaining({ id: 'store-id-1' }),
          action: StoreWarehouseHistoryAction.Assign,
          relatedStore: expect.objectContaining({ id: 'store-id-2' }),
        }),
      ]);
    });

    it('also takes the warehouse from a soft-deleted store', async () => {
      givenStores(baseStore(), baseStore({ id: 'store-id-2', deletedAt: new Date() }));
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());

      await service.assignWarehouse(actor, 'st-slug-1', assignDto);

      expect(storeRepository.update).toHaveBeenNthCalledWith(
        1,
        { id: 'store-id-2' },
        { warehouse: null },
      );
    });

    it('looks up and locks the holder including soft-deleted stores', async () => {
      givenStores(baseStore());
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());

      await service.assignWarehouse(actor, 'st-slug-1', assignDto);

      expect(storeRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { warehouse: { id: 'wh-id-1' } },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
    });

    // Gửi lại đúng kho đang gắn phải idempotent: không ghi DB, không đẻ dòng lịch sử rác.
    it('is a no-op when the store already holds that warehouse', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore({ warehouse: baseWarehouse() }));
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());

      const result = await service.assignWarehouse(actor, 'st-slug-1', assignDto);

      expect(storeRepository.update).not.toHaveBeenCalled();
      expect(historyRepository.save).not.toHaveBeenCalled();
      expect(result).toMatchObject({ warehouseSlug: 'wh-slug-1' });
    });

    it('is a no-op when unassigning a store that has no warehouse', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());

      await service.assignWarehouse(actor, 'st-slug-1', { warehouseSlug: null });

      expect(storeRepository.update).not.toHaveBeenCalled();
      expect(historyRepository.save).not.toHaveBeenCalled();
    });

    it('throws WAREHOUSE_NOT_FOUND when the warehouse does not exist (or is soft-deleted)', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      warehouseRepository.findOneBy.mockResolvedValue(null);

      const promise = service.assignWarehouse(actor, 'st-slug-1', assignDto);
      await expect(promise).rejects.toBeInstanceOf(WarehouseException);
      await expect(promise).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
      expect(storeRepository.update).not.toHaveBeenCalled();
    });

    it('refuses an inactive warehouse', async () => {
      storeRepository.findOne.mockResolvedValue(baseStore());
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse({ isActive: false }));

      await expectStoreError(
        service.assignWarehouse(actor, 'st-slug-1', assignDto),
        StoreValidation.STORE_WAREHOUSE_INACTIVE.code,
      );
      expect(storeRepository.update).not.toHaveBeenCalled();
    });

    it('throws when the store is not found', async () => {
      storeRepository.findOne.mockResolvedValue(null);

      await expectStoreError(
        service.assignWarehouse(actor, 'missing-slug', assignDto),
        StoreValidation.STORE_NOT_FOUND.code,
      );
    });
  });

  describe('findWarehouseHistories', () => {
    const query = { page: 1, size: 10 };

    it('lists the store history newest first, including soft-deleted relations', async () => {
      storeRepository.findOneBy.mockResolvedValue(baseStore());
      historyRepository.findAndCount.mockResolvedValue([
        [
          {
            slug: 'h-1',
            action: StoreWarehouseHistoryAction.Assign,
            previousWarehouse: baseWarehouse({ slug: 'wh-slug-0', name: 'Kho cũ' }),
            newWarehouse: baseWarehouse(),
            relatedStore: otherStoreFixture(),
            changedBy: { slug: 'u-slug-1', firstName: 'An', lastName: 'Nguyễn' },
          },
        ],
        11,
      ]);

      const result = await service.findWarehouseHistories('st-slug-1', query);

      expect(historyRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { store: { id: 'store-id-1' } },
          withDeleted: true,
          order: { createdAt: 'DESC' },
          skip: 0,
          take: 10,
        }),
      );
      expect(result).toMatchObject({ total: 11, totalPages: 2, hasNext: true });
      expect(result.items[0]).toMatchObject({
        slug: 'h-1',
        action: 'ASSIGN',
        previousWarehouseSlug: 'wh-slug-0',
        previousWarehouseName: 'Kho cũ',
        newWarehouseSlug: 'wh-slug-1',
        relatedStoreSlug: 'st-slug-2',
        changedBySlug: 'u-slug-1',
        changedByName: 'Nguyễn An',
      });
    });

    it('throws when the store is not found', async () => {
      storeRepository.findOneBy.mockResolvedValue(null);

      await expectStoreError(
        service.findWarehouseHistories('missing', query),
        StoreValidation.STORE_NOT_FOUND.code,
      );
    });
  });

  describe('restoreWarehouse', () => {
    const entry = (previousWarehouse: Warehouse | null) =>
      ({ id: 'h-id-1', slug: 'h-1', previousWarehouse }) as StoreWarehouseHistory;

    it('re-applies the previous warehouse of the entry and records RESTORE', async () => {
      const previous = baseWarehouse({ id: 'wh-id-0', slug: 'wh-slug-0' });
      historyRepository.findOne.mockResolvedValue(entry(previous));
      storeRepository.findOne
        .mockResolvedValueOnce(baseStore({ warehouse: baseWarehouse() }))
        .mockResolvedValueOnce(null);
      warehouseRepository.findOneBy.mockResolvedValue(previous);

      const result = await service.restoreWarehouse(actor, 'st-slug-1', 'h-1');

      expect(historyRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'h-1', store: { slug: 'st-slug-1' } },
        relations: { previousWarehouse: true },
        withDeleted: true,
      });
      expect(warehouseRepository.findOneBy).toHaveBeenCalledWith({ slug: 'wh-slug-0' });
      expect(historyRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: StoreWarehouseHistoryAction.Restore,
          restoredFrom: expect.objectContaining({ slug: 'h-1' }),
          previousWarehouse: expect.objectContaining({ id: 'wh-id-1' }),
          newWarehouse: previous,
        }),
      );
      expect(result).toMatchObject({ warehouseSlug: 'wh-slug-0' });
    });

    it('unassigns when the entry had no previous warehouse', async () => {
      historyRepository.findOne.mockResolvedValue(entry(null));
      storeRepository.findOne.mockResolvedValue(baseStore({ warehouse: baseWarehouse() }));

      await service.restoreWarehouse(actor, 'st-slug-1', 'h-1');

      expect(storeRepository.update).toHaveBeenCalledWith(
        { id: 'store-id-1' },
        { warehouse: null },
      );
      expect(savedHistoriesOf(historyRepository)[0]).toMatchObject({
        action: StoreWarehouseHistoryAction.Restore,
      });
    });

    // Kho cũ đã xoá mềm: được nạp nhờ `withDeleted`, rồi bị `resolveWarehouse` chặn — KHÔNG được
    // hiểu nhầm thành "trước đó không có kho" và gỡ kho hiện tại.
    it('refuses to restore a warehouse that has since been deleted', async () => {
      const deleted = baseWarehouse({ id: 'wh-id-0', slug: 'wh-slug-0', deletedAt: new Date() });
      historyRepository.findOne.mockResolvedValue(entry(deleted));
      storeRepository.findOne.mockResolvedValue(baseStore({ warehouse: baseWarehouse() }));
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expect(service.restoreWarehouse(actor, 'st-slug-1', 'h-1')).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
      expect(storeRepository.update).not.toHaveBeenCalled();
    });

    it('throws when the entry does not belong to the store (or does not exist)', async () => {
      historyRepository.findOne.mockResolvedValue(null);

      await expectStoreError(
        service.restoreWarehouse(actor, 'st-slug-1', 'h-x'),
        StoreValidation.STORE_WAREHOUSE_HISTORY_NOT_FOUND.code,
      );
      expect(storeRepository.update).not.toHaveBeenCalled();
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
