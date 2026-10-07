import { CurrentUserDto } from 'src/user/user.decorator';
import { GetAvailableWarehouseMemberRequestDto } from './warehouse.dto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { IsNull, Not } from 'typeorm';
import { WarehouseService } from './warehouse.service';
import { WarehouseProfile } from './warehouse.mapper';
import { Warehouse } from './warehouse.entity';
import { WarehouseMember } from './warehouse-member.entity';
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
    manager: null,
    ...overrides,
  }) as Warehouse;

const managerUser = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'user-id-1',
    slug: 'manager-slug-1',
    phonenumber: '0900000000',
    firstName: 'Minh',
    lastName: 'Nguyen',
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
  const warehouseMemberRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    recover: jest.fn(),
    softRemove: jest.fn(),
    existsBy: jest.fn(),
    find: jest.fn(),
  };
  const userService = { findBySlug: jest.fn(), findAll: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        WarehouseProfile,
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        {
          provide: getRepositoryToken(WarehouseMember),
          useValue: warehouseMemberRepository,
        },
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
    const admin: CurrentUserDto = { userId: 'admin-id', roleName: RoleEnum.Admin, scope: [] };

    it('always loads the manager relation', async () => {
      await service.findAll({ page: 1, size: 10 }, admin);

      expect(warehouseRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: { manager: true, store: true },
          order: { createdAt: 'DESC' },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('filters by isActive, including the false case', async () => {
      await service.findAll({ page: 1, size: 10, isActive: false }, admin);

      expect(whereOf()).toEqual({ isActive: false });
    });

    it('filters by managerSlug through the relation', async () => {
      await service.findAll({ page: 1, size: 10, managerSlug: 'manager-slug-1' }, admin);

      expect(whereOf()).toEqual({ manager: { slug: 'manager-slug-1' } });
    });

    it('maps hasManager=false to IsNull and hasManager=true to Not(IsNull)', async () => {
      await service.findAll({ page: 1, size: 10, hasManager: false }, admin);
      expect(whereOf()).toEqual({ manager: IsNull() });

      warehouseRepository.findAndCount.mockClear();
      await service.findAll({ page: 1, size: 10, hasManager: true }, admin);
      expect(whereOf()).toEqual({ manager: Not(IsNull()) });
    });

    // Mọi role dưới ADMIN chỉ thấy kho mình là manager HOẶC thành viên; filter manager trong query
    // không mở rộng được phạm vi. Fail-closed: role tự tạo hay token thiếu claim `role` cũng bị giới
    // hạn, không rơi sang nhánh "thấy toàn bộ".
    it.each([RoleEnum.Manager, RoleEnum.Supervisor, 'CUSTOM_ROLE', undefined])(
      'scopes %s to warehouses they manage or are a member of, ignoring manager filters',
      async (roleName) => {
        await service.findAll(
          { page: 1, size: 10, isActive: true, managerSlug: 'someone-else', hasManager: false },
          { userId: 'user-id-1', roleName, scope: [] },
        );

        expect(whereOf()).toEqual([
          { isActive: true, manager: { id: 'user-id-1' } },
          { isActive: true, members: { user: { id: 'user-id-1' } } },
        ]);
      },
    );

    it.each([RoleEnum.Admin, RoleEnum.SuperAdmin])('does not scope %s', async (roleName) => {
      await service.findAll({ page: 1, size: 10 }, { userId: 'user-id-1', roleName, scope: [] });

      expect(whereOf()).toEqual({});
    });

    it('treats an unparseable hasManager as absent rather than false', async () => {
      // DTO trả nguyên chuỗi lạ cho `@IsBoolean` bắt; service không được coi nó là `false` và
      // lọc ngược tập dữ liệu.
      await service.findAll({ page: 1, size: 10, hasManager: 'notabool' } as never, admin);

      expect(whereOf()).toEqual({});
    });

    it('ignores hasManager when managerSlug is given', async () => {
      await service.findAll(
        { page: 1, size: 10, managerSlug: 'manager-slug-1', hasManager: false },
        admin,
      );

      expect(whereOf()).toEqual({ manager: { slug: 'manager-slug-1' } });
    });

    it('computes pagination metadata and flattens the manager and store fields', async () => {
      warehouseRepository.findAndCount.mockResolvedValue([
        [
          baseWarehouse({
            manager: managerUser(),
            store: { slug: 'store-slug-1', name: 'Cửa hàng Hà Nội 1' } as never,
          }),
        ],
        3,
      ]);

      const result = await service.findAll({ page: 2, size: 1 }, admin);

      expect(result).toMatchObject({
        total: 3,
        page: 2,
        pageSize: 1,
        totalPages: 3,
        hasNext: true,
        hasPrevios: true,
      });
      expect(result.items[0]).toMatchObject({
        managerSlug: 'manager-slug-1',
        managerPhonenumber: '0900000000',
        managerFirstName: 'Minh',
        managerLastName: 'Nguyen',
        storeSlug: 'store-slug-1',
        storeName: 'Cửa hàng Hà Nội 1',
      });
    });

    it('leaves manager and store fields empty when neither is linked', async () => {
      warehouseRepository.findAndCount.mockResolvedValue([[baseWarehouse()], 1]);

      const result = await service.findAll({ page: 1, size: 10 }, admin);

      expect(result.items[0].managerSlug).toBeUndefined();
      expect(result.items[0].storeSlug).toBeUndefined();
      expect(result.items[0].storeName).toBeUndefined();
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
    const admin: CurrentUserDto = { userId: 'admin-id', roleName: RoleEnum.Admin, scope: [] };
    const user = (roleName?: string): CurrentUserDto => ({
      userId: 'user-id-1',
      roleName,
      scope: [],
    });

    it('throws when the warehouse is not found', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);

      await expectWarehouseError(
        service.findOne('missing-slug', admin),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });

    it('loads the manager relation', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());

      await service.findOne('wh-slug-1', admin);

      expect(warehouseRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'wh-slug-1' },
        relations: { manager: true, store: true },
      });
    });

    it.each([RoleEnum.Admin, RoleEnum.SuperAdmin])(
      'lets %s read any warehouse without a membership lookup',
      async (roleName) => {
        warehouseRepository.findOne.mockResolvedValue(baseWarehouse());

        await expect(service.findOne('wh-slug-1', user(roleName))).resolves.toBeDefined();
        expect(warehouseMemberRepository.existsBy).not.toHaveBeenCalled();
      },
    );

    it('lets the manager of the warehouse read it', async () => {
      warehouseRepository.findOne.mockResolvedValue({
        ...baseWarehouse(),
        manager: { id: 'user-id-1' },
      });

      await expect(service.findOne('wh-slug-1', user(RoleEnum.Manager))).resolves.toBeDefined();
      expect(warehouseMemberRepository.existsBy).not.toHaveBeenCalled();
    });

    it('lets a member of the warehouse read it', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseMemberRepository.existsBy.mockResolvedValue(true);

      await expect(service.findOne('wh-slug-1', user(RoleEnum.Supervisor))).resolves.toBeDefined();
      expect(warehouseMemberRepository.existsBy).toHaveBeenCalledWith({
        warehouse: { id: baseWarehouse().id },
        user: { id: 'user-id-1' },
      });
    });

    // Fail-closed: role tự tạo hay token thiếu claim `role` cũng phải là manager/thành viên.
    it.each([RoleEnum.Manager, RoleEnum.Supervisor, 'CUSTOM_ROLE', undefined])(
      'rejects %s who is neither manager nor member',
      async (roleName) => {
        warehouseRepository.findOne.mockResolvedValue({
          ...baseWarehouse(),
          manager: { id: 'someone-else' },
        });
        warehouseMemberRepository.existsBy.mockResolvedValue(false);

        await expectWarehouseError(
          service.findOne('wh-slug-1', user(roleName)),
          WarehouseValidation.WAREHOUSE_ACCESS_DENIED.code,
        );
      },
    );
  });

  // PATCH phải là partial update đúng nghĩa REST: field không gửi giữ nguyên giá trị cũ.
  describe('updateWarehouse — partial (PATCH)', () => {
    beforeEach(() => {
      // `jest.clearAllMocks()` chỉ xoá lịch sử gọi, KHÔNG xoá implementation đã set ở test trước.
      warehouseRepository.findOneBy.mockResolvedValue(null);
    });

    it('chỉ đổi field được gửi, các field khác giữ nguyên', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseRepository.save.mockImplementation((data) => data);

      const result = await service.updateWarehouse('wh-slug-1', {
        name: 'Kho Hà Nội 2',
      } as never);

      expect(result).toMatchObject({
        name: 'Kho Hà Nội 2',
        code: 'WH-HN-01',
        address: 'Số 1, Cầu Giấy, Hà Nội',
      });
    });

    it('không check trùng cho field không gửi', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseRepository.save.mockImplementation((data) => data);

      await service.updateWarehouse('wh-slug-1', { name: 'Tên mới' } as never);

      expect(warehouseRepository.findOneBy).toHaveBeenCalledTimes(1);
      expect(warehouseRepository.findOneBy).toHaveBeenCalledWith({ name: 'Tên mới' });
    });

    // `PartialType` sao chép initializer `isActive = true` của DTO cha ⇒ nếu không huỷ, PATCH không
    // gửi `isActive` sẽ bật lại kho đã ngừng hoạt động.
    it('không tự bật lại isActive khi PATCH không gửi field đó', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse({ isActive: false }));
      warehouseRepository.save.mockImplementation((data) => data);

      const result = await service.updateWarehouse('wh-slug-1', {
        name: 'Tên mới',
      } as never);

      expect(result.isActive).toBe(false);
    });
  });

  describe('updateWarehouse', () => {
    const updateDto = createDto();

    it('loads the row by slug', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseRepository.save.mockImplementation((data) => data);

      await service.updateWarehouse('wh-slug-1', updateDto);

      expect(warehouseRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'wh-slug-1' },
        relations: { manager: true, store: true },
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

    it('throws when the warehouse is not found', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);

      await expectWarehouseError(
        service.updateWarehouse('missing-slug', updateDto),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });
  });

  describe('assignMember', () => {
    const memberUser = () =>
      managerUser({ slug: 'member-slug-1', role: { name: RoleEnum.Supervisor } });

    beforeEach(() => {
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());
      userService.findBySlug.mockResolvedValue(memberUser());
      warehouseMemberRepository.findOne.mockResolvedValue(null);
      warehouseMemberRepository.create.mockImplementation((data) => ({
        slug: 'm-slug-1',
        ...data,
      }));
      warehouseMemberRepository.save.mockImplementation((data) => data);
      warehouseMemberRepository.recover.mockImplementation((data) => ({
        ...data,
        deletedAt: null,
      }));
    });

    it('creates a membership row and never touches the warehouse manager', async () => {
      const result = await service.assignMember('wh-slug-1', { userSlug: 'member-slug-1' });

      expect(warehouseMemberRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          warehouse: expect.objectContaining({ id: 'warehouse-id-1' }),
          user: expect.objectContaining({ id: 'user-id-1' }),
        }),
      );
      expect(warehouseRepository.save).not.toHaveBeenCalled();
      expect(result.slug).toBe('m-slug-1');
      expect(result.user).toEqual({
        slug: 'member-slug-1',
        phonenumber: '0900000000',
        firstName: 'Minh',
        lastName: 'Nguyen',
      });
    });

    it('looks the existing row up including soft-deleted ones', async () => {
      await service.assignMember('wh-slug-1', { userSlug: 'member-slug-1' });

      expect(warehouseMemberRepository.findOne).toHaveBeenCalledWith({
        where: { warehouse: { id: 'warehouse-id-1' }, user: { id: 'user-id-1' } },
        withDeleted: true,
      });
    });

    // UNIQUE (warehouse, user) tính cả row xoá mềm — insert mới sẽ ER_DUP_ENTRY thành 500.
    it('recovers a previously removed membership instead of inserting a new row', async () => {
      const removed = { id: 'm-id-1', slug: 'm-slug-old', deletedAt: new Date() };
      warehouseMemberRepository.findOne.mockResolvedValue(removed);

      const result = await service.assignMember('wh-slug-1', { userSlug: 'member-slug-1' });

      expect(warehouseMemberRepository.recover).toHaveBeenCalledWith(removed);
      expect(warehouseMemberRepository.save).not.toHaveBeenCalled();
      expect(result.slug).toBe('m-slug-old');
    });

    // PUT idempotent: gán lại không 409, không ghi gì, trả đúng row đang có.
    it('returns the existing membership without writing when already a member', async () => {
      warehouseMemberRepository.findOne.mockResolvedValue({
        id: 'm-id-1',
        slug: 'm-slug-1',
        deletedAt: null,
      });

      const result = await service.assignMember('wh-slug-1', { userSlug: 'member-slug-1' });

      expect(warehouseMemberRepository.save).not.toHaveBeenCalled();
      expect(warehouseMemberRepository.recover).not.toHaveBeenCalled();
      expect(result.slug).toBe('m-slug-1');
      expect(result.user.slug).toBe('member-slug-1');
    });

    it('throws when the warehouse does not exist', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectWarehouseError(
        service.assignMember('ghost', { userSlug: 'member-slug-1' }),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
    });

    it('throws when the user does not exist', async () => {
      userService.findBySlug.mockResolvedValue(null);

      await expectWarehouseError(
        service.assignMember('wh-slug-1', { userSlug: 'ghost' }),
        WarehouseValidation.WAREHOUSE_MEMBER_USER_NOT_FOUND.code,
      );
    });

    it('throws when the user is inactive', async () => {
      userService.findBySlug.mockResolvedValue(managerUser({ isActive: false }));

      await expectWarehouseError(
        service.assignMember('wh-slug-1', { userSlug: 'member-slug-1' }),
        WarehouseValidation.WAREHOUSE_MEMBER_USER_INACTIVE.code,
      );
    });

    it.each([RoleEnum.Admin, RoleEnum.SuperAdmin])(
      'rejects assigning a %s user as a member',
      async (roleName) => {
        userService.findBySlug.mockResolvedValue(managerUser({ role: { name: roleName } }));

        await expectWarehouseError(
          service.assignMember('wh-slug-1', { userSlug: 'member-slug-1' }),
          WarehouseValidation.WAREHOUSE_MEMBER_USER_IS_ADMIN.code,
        );
        expect(warehouseMemberRepository.save).not.toHaveBeenCalled();
        expect(warehouseMemberRepository.recover).not.toHaveBeenCalled();
      },
    );
  });

  describe('findUserWarehouse', () => {
    it('returns null when the warehouse does not exist', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);

      await expect(service.findUserWarehouse('ghost', 'user-id-1')).resolves.toBeNull();
      expect(warehouseMemberRepository.existsBy).not.toHaveBeenCalled();
    });

    it('returns the warehouse as manager without querying the member table', async () => {
      const warehouse = baseWarehouse({ manager: managerUser() });
      warehouseRepository.findOne.mockResolvedValue(warehouse);

      await expect(service.findUserWarehouse('wh-slug-1', 'user-id-1')).resolves.toEqual({
        id: warehouse.id,
        slug: warehouse.slug,
        code: warehouse.code,
        name: warehouse.name,
        isManager: true,
      });
      expect(warehouseMemberRepository.existsBy).not.toHaveBeenCalled();
    });

    it('checks the member table for anyone else and returns the warehouse as member', async () => {
      const warehouse = baseWarehouse();
      warehouseRepository.findOne.mockResolvedValue(warehouse);
      warehouseMemberRepository.existsBy.mockResolvedValue(true);

      await expect(service.findUserWarehouse('wh-slug-1', 'user-id-2')).resolves.toEqual({
        id: warehouse.id,
        slug: warehouse.slug,
        code: warehouse.code,
        name: warehouse.name,
        isManager: false,
      });
      expect(warehouseMemberRepository.existsBy).toHaveBeenCalledWith({
        warehouse: { id: 'warehouse-id-1' },
        user: { id: 'user-id-2' },
      });
    });

    it('returns false for an outsider', async () => {
      warehouseRepository.findOne.mockResolvedValue(baseWarehouse());
      warehouseMemberRepository.existsBy.mockResolvedValue(false);

      await expect(service.findUserWarehouse('wh-slug-1', 'user-id-2')).resolves.toBe(false);
    });
  });

  describe('findAvailableMembers', () => {
    const query = { page: 1, size: 10 } as GetAvailableWarehouseMemberRequestDto;

    it('excludes current members and the manager, and only lists active users', async () => {
      warehouseRepository.findOne.mockResolvedValue({ id: 'wh-id', manager: { id: 'mgr-id' } });
      warehouseMemberRepository.find.mockResolvedValue([
        { user: { id: 'u1' } },
        { user: { id: 'u2' } },
      ]);
      const page = { items: [], total: 0 };
      userService.findAll.mockResolvedValue(page);

      await expect(service.findAvailableMembers('wh-slug', query)).resolves.toBe(page);

      expect(warehouseMemberRepository.find).toHaveBeenCalledWith({
        where: { warehouse: { id: 'wh-id' } },
        relations: { user: true },
      });
      expect(userService.findAll).toHaveBeenCalledWith(query, {
        excludedIds: ['u1', 'u2', 'mgr-id'],
        onlyActive: true,
        excludedRoleNames: [RoleEnum.Admin, RoleEnum.SuperAdmin],
      });
    });

    it('works for a warehouse without manager or members', async () => {
      warehouseRepository.findOne.mockResolvedValue({ id: 'wh-id', manager: null });
      warehouseMemberRepository.find.mockResolvedValue([]);

      await service.findAvailableMembers('wh-slug', query);

      expect(userService.findAll).toHaveBeenCalledWith(query, {
        excludedIds: [],
        onlyActive: true,
        excludedRoleNames: [RoleEnum.Admin, RoleEnum.SuperAdmin],
      });
    });

    it('rejects an unknown warehouse', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);

      await expect(service.findAvailableMembers('missing', query)).rejects.toMatchObject({
        code: WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      });
      expect(userService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    beforeEach(() => {
      warehouseRepository.findOneBy.mockResolvedValue(baseWarehouse());
    });

    it('soft removes the membership row of that user in that warehouse', async () => {
      const member = { id: 'm-id-1', slug: 'm-slug-1' };
      warehouseMemberRepository.findOne.mockResolvedValue(member);

      const result = await service.removeMember('wh-slug-1', 'member-slug-1');

      expect(warehouseMemberRepository.findOne).toHaveBeenCalledWith({
        where: { warehouse: { id: 'warehouse-id-1' }, user: { slug: 'member-slug-1' } },
      });
      expect(warehouseMemberRepository.softRemove).toHaveBeenCalledWith(member);
      expect(warehouseRepository.save).not.toHaveBeenCalled();
      expect(result).toBe(1);
    });

    it('throws when the warehouse does not exist', async () => {
      warehouseRepository.findOneBy.mockResolvedValue(null);

      await expectWarehouseError(
        service.removeMember('ghost', 'member-slug-1'),
        WarehouseValidation.WAREHOUSE_NOT_FOUND.code,
      );
      expect(warehouseMemberRepository.softRemove).not.toHaveBeenCalled();
    });

    it('throws when the user is not a member of the warehouse', async () => {
      warehouseMemberRepository.findOne.mockResolvedValue(null);

      await expectWarehouseError(
        service.removeMember('wh-slug-1', 'member-slug-1'),
        WarehouseValidation.WAREHOUSE_MEMBER_NOT_FOUND.code,
      );
      expect(warehouseMemberRepository.softRemove).not.toHaveBeenCalled();
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
      });

      expect(warehouseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ manager: expect.objectContaining({ id: 'user-id-1' }) }),
      );
      expect(result.managerSlug).toBe('manager-slug-1');
    });

    it('unassigns without looking the user up when managerSlug is null', async () => {
      const result = await service.assignManager('wh-slug-1', { managerSlug: null });

      expect(userService.findBySlug).not.toHaveBeenCalled();
      expect(warehouseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ manager: null }),
      );
      expect(result.managerSlug).toBeUndefined();
    });

    it('throws when the target user does not exist', async () => {
      userService.findBySlug.mockResolvedValue(null);

      await expectWarehouseError(
        service.assignManager('wh-slug-1', { managerSlug: 'ghost' }),
        WarehouseValidation.WAREHOUSE_MANAGER_NOT_FOUND.code,
      );
    });

    it('throws when the target user is inactive', async () => {
      userService.findBySlug.mockResolvedValue(managerUser({ isActive: false }));

      await expectWarehouseError(
        service.assignManager('wh-slug-1', { managerSlug: 'manager-slug-1' }),
        WarehouseValidation.WAREHOUSE_MANAGER_INACTIVE.code,
      );
    });

    it('throws when the target user is not a MANAGER', async () => {
      userService.findBySlug.mockResolvedValue(
        managerUser({ role: { name: RoleEnum.Supervisor } }),
      );

      await expectWarehouseError(
        service.assignManager('wh-slug-1', { managerSlug: 'manager-slug-1' }),
        WarehouseValidation.WAREHOUSE_MANAGER_ROLE_INVALID.code,
      );
      expect(warehouseRepository.save).not.toHaveBeenCalled();
    });

    it('loads the row by slug', async () => {
      await service.assignManager('wh-slug-1', { managerSlug: null });

      expect(warehouseRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'wh-slug-1' },
        relations: { manager: true, store: true },
      });
    });

    it('throws when the warehouse is not found', async () => {
      warehouseRepository.findOne.mockResolvedValue(null);

      await expectWarehouseError(
        service.assignManager('missing-slug', { managerSlug: null }),
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
