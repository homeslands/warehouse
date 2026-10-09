import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { ConfigService } from '@nestjs/config';
import { RoleService } from 'src/role/role.service';
import { RoleEnum } from 'src/role/role.enum';
import { TokenRevocationService } from 'src/auth/token-revocation.service';
import { UserService } from './user.service';
import { UserProfile } from './user.mapper';
import { User } from './user.entity';
import { UserException } from './user.exception';
import { UserValidation } from './user.validation';
import { CurrentUserDto } from './user.decorator';
import { GetAllUserRequestDto } from './user.dto';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseMember } from 'src/warehouse/warehouse-member.entity';
import { And, In, LessThan, Like, MoreThanOrEqual, Not } from 'typeorm';

describe('UserService', () => {
  let service: UserService;

  const userRepository = {
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const transactionManager = { softDelete: jest.fn() };
  const tokenRevocationService = {
    revokeSession: jest.fn(),
    revokeAllTokensForUser: jest.fn(),
  };
  const warehouseRepository = { count: jest.fn(), find: jest.fn() };
  const roleService = { findBySlug: jest.fn(), assertCanManage: jest.fn(), actorLevel: jest.fn() };
  const config: Record<string, string> = { SALT_ROUNDS: '4' };
  const configService = { get: (key: string) => config[key] };

  const caller = (overrides: Partial<CurrentUserDto> = {}): CurrentUserDto => ({
    userId: 'user-id',
    roleName: RoleEnum.Manager,
    sessionId: 'sid-1',
    scope: [],
    ...overrides,
  });

  const other = {
    id: 'other-id',
    slug: 'other-slug',
    isActive: true,
    password: 'other-hash',
    role: { name: RoleEnum.Supervisor },
  } as unknown as User;

  const expectUserError = async (promise: Promise<unknown>, code: number) => {
    await expect(promise).rejects.toBeInstanceOf(UserException);
    await expect(promise).rejects.toMatchObject({ code });
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        UserProfile,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: ConfigService, useValue: configService },
        { provide: RoleService, useValue: roleService },
        { provide: TokenRevocationService, useValue: tokenRevocationService },
      ],
    }).compile();
    await module.init();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    const adminRole = { id: 'admin-role-id', slug: 'admin', name: RoleEnum.Admin, level: 30 };
    const dto = {
      phonenumber: '0900000000',
      firstName: 'A',
      lastName: 'B',
      password: 'secret',
      roleSlug: 'admin',
    };

    beforeEach(() => {
      userRepository.findOneBy.mockResolvedValue(null);
      roleService.findBySlug.mockResolvedValue(adminRole);
      userRepository.create.mockImplementation((data) => data);
      userRepository.save.mockImplementation(async (data) => ({ ...data, id: 'new-id' }));
    });

    // Chặn leo thang đặc quyền: có USER_CREATE vẫn không được tạo tài khoản ngang/cao cấp hơn mình.
    it('rejects assigning a role the caller cannot manage', async () => {
      const forbidden = new Error('ROLE_LEVEL_FORBIDDEN');
      roleService.assertCanManage.mockRejectedValue(forbidden);

      await expect(service.createUser(dto, caller())).rejects.toBe(forbidden);
      expect(roleService.assertCanManage).toHaveBeenCalledWith(caller(), adminRole);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    // `actor = null` chỉ dành cho RootUserSeeder — không có người thao tác để so cấp.
    it('skips the level check for a system-created user', async () => {
      await service.createUser(dto, null);

      expect(roleService.assertCanManage).not.toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
    });
  });

  // Check authority `USER_CHANGE_PASSWORD` nằm ở `@RequireAuthority` trên controller (quyền tĩnh,
  // `AuthorityGuard` chặn trước khi vào service) — ở đây chỉ còn các rào phụ thuộc dữ liệu: không
  // được tự trỏ vào mình, không được đụng tới `SUPER_ADMIN`, và không đổi hộ user cấp role cao hơn.
  describe('changeUserPassword', () => {
    it('changes another account without asking for the current password', async () => {
      userRepository.findOneBy.mockResolvedValue(other);

      const result = await service.changeUserPassword(caller(), 'other-slug', {
        newPassword: 'new-password',
      });

      expect(userRepository.update).toHaveBeenCalledWith(
        { id: 'other-id' },
        { password: expect.not.stringContaining('new-password') },
      );
      expect(tokenRevocationService.revokeAllTokensForUser).toHaveBeenCalledWith('other-id');
      // Người đổi hộ không bị văng ra: không đụng tới phiên của chính họ.
      expect(tokenRevocationService.revokeSession).not.toHaveBeenCalled();
      expect(result).toEqual({ userSlug: 'other-slug' });
    });

    // Endpoint này không hỏi mật khẩu hiện tại — cho tự trỏ vào mình là mở đường cho token bị đánh
    // cắp của admin đổi mật khẩu chính tài khoản đó.
    it('rejects targeting your own account', async () => {
      userRepository.findOneBy.mockResolvedValue({
        id: 'user-id',
        slug: 'my-slug',
        role: { name: RoleEnum.Manager },
      } as unknown as User);

      await expectUserError(
        service.changeUserPassword(caller(), 'my-slug', { newPassword: 'new-password' }),
        UserValidation.CHANGE_OWN_PASSWORD_NOT_ALLOWED.code,
      );
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    // Chặn leo thang đặc quyền: có USER_CHANGE_PASSWORD vẫn không được reset mật khẩu tài khoản root.
    it('rejects changing a SUPER_ADMIN password when the caller is not one', async () => {
      userRepository.findOneBy.mockResolvedValue({
        ...other,
        role: { name: RoleEnum.SuperAdmin },
      } as unknown as User);

      await expectUserError(
        service.changeUserPassword(caller(), 'other-slug', { newPassword: 'new-password' }),
        UserValidation.CHANGE_PASSWORD_FORBIDDEN.code,
      );
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('lets a SUPER_ADMIN change even another SUPER_ADMIN password', async () => {
      userRepository.findOneBy.mockResolvedValue({
        ...other,
        role: { name: RoleEnum.SuperAdmin },
      } as unknown as User);

      await service.changeUserPassword(caller({ roleName: RoleEnum.SuperAdmin }), 'other-slug', {
        newPassword: 'new-password',
      });

      expect(userRepository.update).toHaveBeenCalled();
      expect(tokenRevocationService.revokeAllTokensForUser).toHaveBeenCalledWith('other-id');
    });

    // MANAGER (cấp thấp hơn) có USER_CHANGE_PASSWORD vẫn không được reset mật khẩu của ADMIN.
    it('rejects when the caller role level is lower than the target role level', async () => {
      roleService.actorLevel.mockResolvedValue(2);
      userRepository.findOneBy.mockResolvedValue({
        ...other,
        role: { name: RoleEnum.Admin, level: 3 },
      } as unknown as User);

      await expectUserError(
        service.changeUserPassword(caller(), 'other-slug', { newPassword: 'new-password' }),
        UserValidation.CHANGE_PASSWORD_FORBIDDEN.code,
      );
      expect(roleService.actorLevel).toHaveBeenCalledWith(caller());
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(tokenRevocationService.revokeAllTokensForUser).not.toHaveBeenCalled();
    });

    it.each([
      ['lower', 1],
      ['equal', 2],
    ])('allows a target with a %s role level', async (_label, targetLevel) => {
      roleService.actorLevel.mockResolvedValue(2);
      userRepository.findOneBy.mockResolvedValue({
        ...other,
        role: { name: RoleEnum.Supervisor, level: targetLevel },
      } as unknown as User);

      await service.changeUserPassword(caller(), 'other-slug', { newPassword: 'new-password' });

      expect(userRepository.update).toHaveBeenCalled();
    });

    it('rejects an unknown target user', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expectUserError(
        service.changeUserPassword(caller(), 'ghost', { newPassword: 'new-password' }),
        UserValidation.USER_NOT_FOUND.code,
      );
    });
  });

  describe('updateUser — partial (PATCH)', () => {
    beforeEach(() => {
      userRepository.findOneBy.mockResolvedValueOnce({ ...other, firstName: 'Old', lastName: 'L' });
      userRepository.save.mockImplementation(async (data) => data);
    });

    it('changes only the fields that were sent', async () => {
      const result = await service.updateUser(caller(), 'other-slug', { firstName: 'New' });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'New', lastName: 'L', password: 'other-hash' }),
      );
      expect(result.firstName).toBe('New');
      expect(roleService.assertCanManage).toHaveBeenCalledWith(caller(), other.role);
    });

    it('rejects a phone number already used by someone else', async () => {
      userRepository.findOne.mockResolvedValueOnce({ id: 'third-id' });

      await expectUserError(
        service.updateUser(caller(), 'other-slug', { phonenumber: '0911111111' }),
        UserValidation.USER_PHONENUMBER_DOES_EXIST.code,
      );
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('rejects editing a user the caller cannot manage', async () => {
      const forbidden = new Error('ROLE_LEVEL_FORBIDDEN');
      roleService.assertCanManage.mockRejectedValueOnce(forbidden);

      await expect(service.updateUser(caller(), 'other-slug', { firstName: 'X' })).rejects.toBe(
        forbidden,
      );
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('lockUser', () => {
    beforeEach(() => {
      warehouseRepository.count.mockResolvedValue(0);
      userRepository.save.mockImplementation(async (data) => data);
    });

    it('deactivates the user and revokes all their sessions', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other });

      const result = await service.lockUser(caller(), 'other-slug');

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(tokenRevocationService.revokeAllTokensForUser).toHaveBeenCalledWith('other-id');
      expect(result.isActive).toBe(false);
    });

    // Khoá manager là bỏ kho lại không người phụ trách.
    it('rejects locking a warehouse manager', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other });
      warehouseRepository.count.mockResolvedValue(1);

      await expectUserError(
        service.lockUser(caller(), 'other-slug'),
        UserValidation.USER_IS_WAREHOUSE_MANAGER.code,
      );
      expect(warehouseRepository.count).toHaveBeenCalledWith({
        where: { manager: { id: 'other-id' } },
      });
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(tokenRevocationService.revokeAllTokensForUser).not.toHaveBeenCalled();
    });

    it('rejects locking your own account', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other, id: 'user-id' });

      await expectUserError(
        service.lockUser(caller(), 'my-slug'),
        UserValidation.LOCK_OWN_ACCOUNT_NOT_ALLOWED.code,
      );
    });

    it('rejects locking a user the caller cannot manage', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other });
      const forbidden = new Error('ROLE_LEVEL_FORBIDDEN');
      roleService.assertCanManage.mockRejectedValueOnce(forbidden);

      await expect(service.lockUser(caller(), 'other-slug')).rejects.toBe(forbidden);
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findWarehousesOfUser', () => {
    it('returns managed and member warehouses flagged by isManager, without ids', async () => {
      warehouseRepository.find.mockResolvedValue([
        { id: 'wh-id-1', slug: 'wh-1', code: 'WH-01', name: 'Kho 1', manager: { id: 'user-id' } },
        { id: 'wh-id-2', slug: 'wh-2', code: 'WH-02', name: 'Kho 2', manager: { id: 'boss' } },
        { id: 'wh-id-3', slug: 'wh-3', code: 'WH-03', name: 'Kho 3', manager: null },
      ]);

      await expect(service.findWarehousesOfUser('user-id')).resolves.toEqual([
        { slug: 'wh-1', code: 'WH-01', name: 'Kho 1', isManager: true },
        { slug: 'wh-2', code: 'WH-02', name: 'Kho 2', isManager: false },
        { slug: 'wh-3', code: 'WH-03', name: 'Kho 3', isManager: false },
      ]);
      // Điều kiện qua relation `members` — TypeORM tự loại thành viên đã gỡ (xoá mềm) ở JOIN.
      expect(warehouseRepository.find).toHaveBeenCalledWith({
        where: [{ manager: { id: 'user-id' } }, { members: { user: { id: 'user-id' } } }],
        relations: { manager: true },
        order: { name: 'ASC' },
      });
    });
  });

  describe('findAll', () => {
    const query = (overrides: Partial<GetAllUserRequestDto> = {}) =>
      ({ page: 1, size: 10, ...overrides }) as GetAllUserRequestDto;
    const options = () => userRepository.findAndCount.mock.calls[0][0];

    beforeEach(() => {
      userRepository.findAndCount.mockResolvedValue([[], 0]);
    });

    it('loads role and member warehouses, sorts by createdAt DESC by default', async () => {
      await service.findAll(query({ page: 3, size: 5 }));

      expect(userRepository.findAndCount).toHaveBeenCalledWith({
        where: {},
        relations: { role: true, warehouseMembers: { warehouse: true } },
        order: { createdAt: 'DESC', id: 'ASC' },
        skip: 10,
        take: 5,
      });
    });

    it('applies role / phone / birthday filters', async () => {
      await service.findAll(
        query({ roleSlug: 'supervisor', phonenumber: '0900', birthday: '1990-05-20' }),
      );

      expect(options().where).toEqual({
        role: { slug: 'supervisor' },
        phonenumber: Like('%0900%'),
        dob: '1990-05-20',
      });
    });

    // Mảng `where` = OR: mỗi nhánh phải mang đủ điều kiện chung, không thì lọt user ngoài bộ lọc.
    it('searches name across first name, last name and "last first", keeping other filters', async () => {
      await service.findAll(query({ name: 'Nguyễn Văn', phonenumber: '0900' }));

      const where = options().where;
      expect(where).toHaveLength(3);
      for (const branch of where) expect(branch.phonenumber).toEqual(Like('%0900%'));
      expect(where[0].firstName).toEqual(Like('%Nguyễn Văn%'));
      expect(where[1].lastName).toEqual(Like('%Nguyễn Văn%'));
      expect(where[2].lastName.type).toBe('raw');
      expect(where[2].lastName.getSql('User.lastName')).toBe(
        "CONCAT(User.lastName, ' ', User.firstName) LIKE :name",
      );
      expect(where[2].lastName.objectLiteralParameters).toEqual({ name: '%Nguyễn Văn%' });
    });

    // `YYYY-MM-DD` = trọn ngày: endDate so `<` 00:00 ngày kế tiếp.
    it('turns a date-only range into [start 00:00, day after end 00:00)', async () => {
      await service.findAll(query({ startDate: '2026-09-01', endDate: '2026-09-30' }));

      expect(options().where.createdAt).toEqual(
        And(MoreThanOrEqual(new Date(2026, 8, 1)), LessThan(new Date(2026, 9, 1))),
      );
    });

    it('accepts a single-day range', async () => {
      await service.findAll(query({ startDate: '2026-09-01', endDate: '2026-09-01' }));

      expect(options().where.createdAt).toEqual(
        And(MoreThanOrEqual(new Date(2026, 8, 1)), LessThan(new Date(2026, 8, 2))),
      );
    });

    it('rejects startDate after endDate', async () => {
      await expectUserError(
        service.findAll(query({ startDate: '2026-09-02', endDate: '2026-09-01' })),
        UserValidation.USER_DATE_RANGE_INVALID.code,
      );
      expect(userRepository.findAndCount).not.toHaveBeenCalled();
    });

    // Lọc kho bằng tra id trước, không lọc trên relation — nếu không `warehouses` bị cắt còn 1 kho.
    it('filters by warehouse through a member-id lookup, not on the loaded relation', async () => {
      userRepository.find.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      await service.findAll(query({ warehouseSlug: 'wh-1' }));

      expect(userRepository.find).toHaveBeenCalledWith({
        select: { id: true },
        where: { warehouseMembers: { warehouse: { slug: 'wh-1' } } },
      });
      expect(options().where).toEqual({ id: In(['u1', 'u2']) });
      expect(options().relations).toEqual({ role: true, warehouseMembers: { warehouse: true } });
    });

    it('returns an empty page when the warehouse has no member', async () => {
      userRepository.find.mockResolvedValue([]);

      const result = await service.findAll(query({ warehouseSlug: 'wh-1' }));

      expect(result).toMatchObject({ items: [], total: 0 });
      expect(userRepository.findAndCount).not.toHaveBeenCalled();
    });

    it.each([RoleEnum.Manager, RoleEnum.Supervisor, 'CUSTOM_ROLE', undefined])(
      'scopes %s callers to managers/members of the warehouses they belong to',
      async (roleName) => {
        warehouseRepository.find
          .mockResolvedValueOnce([{ id: 'wh-1' }, { id: 'wh-2' }])
          .mockResolvedValueOnce([
            { manager: { id: 'caller-id' }, members: [{ user: { id: 'u1' } }] },
            {
              manager: { id: 'boss' },
              members: [{ user: { id: 'caller-id' } }, { user: { id: 'u1' } }],
            },
          ]);

        await service.findAll(query(), {}, { userId: 'caller-id', roleName, scope: [] });

        expect(warehouseRepository.find).toHaveBeenNthCalledWith(1, {
          select: { id: true },
          where: [{ manager: { id: 'caller-id' } }, { members: { user: { id: 'caller-id' } } }],
        });
        expect(warehouseRepository.find).toHaveBeenNthCalledWith(2, {
          where: { id: In(['wh-1', 'wh-2']) },
          relations: { manager: true, members: { user: true } },
        });
        expect(options().where).toEqual({ id: In(['caller-id', 'u1', 'boss']) });
      },
    );

    it('intersects the caller scope with the warehouse filter and drops excluded ids', async () => {
      warehouseRepository.find
        .mockResolvedValueOnce([{ id: 'wh-1' }])
        .mockResolvedValueOnce([{ manager: { id: 'user-id' }, members: [{ user: { id: 'u1' } }] }]);
      userRepository.find.mockResolvedValue([{ id: 'u1' }, { id: 'outsider' }]);

      await service.findAll(
        query({ warehouseSlug: 'wh-9' }),
        { excludedIds: ['user-id'] },
        caller({ roleName: RoleEnum.Supervisor }),
      );

      expect(options().where).toEqual({ id: In(['u1']) });
    });

    it('returns an empty page without querying users when the caller has no warehouse', async () => {
      warehouseRepository.find.mockResolvedValueOnce([]);

      const result = await service.findAll(
        query({ warehouseSlug: 'wh-1' }),
        {},
        caller({ roleName: RoleEnum.Supervisor }),
      );

      expect(result).toMatchObject({ items: [], total: 0, totalPages: 0, hasNext: false });
      expect(warehouseRepository.find).toHaveBeenCalledTimes(1);
      expect(userRepository.find).not.toHaveBeenCalled();
      expect(userRepository.findAndCount).not.toHaveBeenCalled();
    });

    it.each([RoleEnum.Admin, RoleEnum.SuperAdmin])(
      'does not scope %s callers',
      async (roleName) => {
        await service.findAll(query(), {}, { userId: 'u', roleName, scope: [] });

        expect(options().where).toEqual({});
        expect(warehouseRepository.find).not.toHaveBeenCalled();
      },
    );

    it('applies multi-level sort in order, first occurrence of a field wins', async () => {
      await service.findAll(query({ sort: ['lastName:asc', 'dob:DESC', 'lastName:DESC'] }));

      const order = options().order;
      expect(order).toEqual({ lastName: 'ASC', dob: 'DESC', id: 'ASC' });
      expect(Object.keys(order)).toEqual(['lastName', 'dob', 'id']);
    });

    it.each([true, false])('filters by isActive=%s from the query', async (isActive) => {
      await service.findAll(query({ isActive }));

      expect(options().where).toEqual({ isActive });
    });

    // `available-members` dùng chung query DTO: client gửi `isActive=false` không được mở lại user đã khoá.
    it('lets the internal onlyActive flag override query.isActive', async () => {
      await service.findAll(query({ isActive: false }), { onlyActive: true });

      expect(options().where).toEqual({ isActive: true });
    });

    it('applies the internal exclusion / active-only / role filter', async () => {
      await service.findAll(query({ roleSlug: 'sup' }), {
        excludedIds: ['a', 'b'],
        onlyActive: true,
        excludedRoleNames: [RoleEnum.Admin],
      });

      expect(options().where).toEqual({
        id: Not(In(['a', 'b'])),
        isActive: true,
        role: { slug: 'sup', name: Not(In([RoleEnum.Admin])) },
      });
    });

    // `IN ()` rỗng là lỗi cú pháp MySQL.
    it('skips the id filter when nothing is excluded', async () => {
      await service.findAll(query(), { excludedIds: [] });

      expect(options().where).toEqual({});
    });

    it('maps role + member warehouses onto each user', async () => {
      userRepository.findAndCount.mockResolvedValue([
        [
          {
            ...other,
            role: { slug: 'sup', name: RoleEnum.Supervisor, description: 'Giám sát', level: 10 },
            warehouseMembers: [
              { warehouse: { id: 'wh-id', slug: 'wh-1', code: 'WH-01', name: 'Kho 1' } },
              { warehouse: null },
            ],
          },
        ],
        1,
      ]);

      const result = await service.findAll(query());

      expect(result.total).toBe(1);
      expect(result.items[0].role).toEqual({
        slug: 'sup',
        name: RoleEnum.Supervisor,
        description: 'Giám sát',
        level: 10,
      });
      expect(result.items[0].warehouses).toEqual([{ slug: 'wh-1', code: 'WH-01', name: 'Kho 1' }]);
    });
  });

  describe('findOne', () => {
    const target = {
      ...other,
      role: { slug: 'sup', name: RoleEnum.Supervisor },
      warehouseMembers: [],
    };

    it('loads the user with role and member warehouses', async () => {
      userRepository.findOne.mockResolvedValue(target);

      const result = await service.findOne(caller({ roleName: RoleEnum.Admin }), 'other-slug');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'other-slug' },
        relations: { role: true, warehouseMembers: { warehouse: true } },
      });
      expect(result.slug).toBe('other-slug');
      expect(warehouseRepository.find).not.toHaveBeenCalled();
    });

    it('throws USER_NOT_FOUND for an unknown slug', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expectUserError(
        service.findOne(caller({ roleName: RoleEnum.Admin }), 'missing'),
        UserValidation.USER_NOT_FOUND.code,
      );
    });

    it('lets a scoped caller read a user sharing one of their warehouses', async () => {
      userRepository.findOne.mockResolvedValue(target);
      warehouseRepository.find
        .mockResolvedValueOnce([{ id: 'wh-1' }])
        .mockResolvedValueOnce([
          { manager: { id: 'user-id' }, members: [{ user: { id: 'other-id' } }] },
        ]);

      await expect(service.findOne(caller(), 'other-slug')).resolves.toMatchObject({
        slug: 'other-slug',
      });
    });

    // Ngoài phạm vi trả NOT_FOUND chứ không FORBIDDEN — không lộ user đó có tồn tại.
    it('hides a user outside the scoped caller warehouses as USER_NOT_FOUND', async () => {
      userRepository.findOne.mockResolvedValue(target);
      warehouseRepository.find.mockResolvedValueOnce([]);

      await expectUserError(
        service.findOne(caller(), 'other-slug'),
        UserValidation.USER_NOT_FOUND.code,
      );
    });

    it('always lets a scoped caller read themselves', async () => {
      userRepository.findOne.mockResolvedValue({ ...target, id: 'user-id' });

      await service.findOne(caller({ roleName: RoleEnum.Supervisor }), 'my-slug');

      expect(warehouseRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('unlockUser', () => {
    beforeEach(() => {
      userRepository.save.mockImplementation(async (data) => data);
    });

    it('re-activates a locked user without touching their sessions', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other, isActive: false });

      const result = await service.unlockUser(caller(), 'other-slug');

      expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
      expect(tokenRevocationService.revokeAllTokensForUser).not.toHaveBeenCalled();
      expect(result.isActive).toBe(true);
    });

    it('is a no-op for an active user', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other });

      await service.unlockUser(caller(), 'other-slug');

      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('rejects unlocking a user the caller cannot manage', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other, isActive: false });
      const forbidden = new Error('ROLE_LEVEL_FORBIDDEN');
      roleService.assertCanManage.mockRejectedValueOnce(forbidden);

      await expect(service.unlockUser(caller(), 'other-slug')).rejects.toBe(forbidden);
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    beforeEach(() => {
      warehouseRepository.count.mockResolvedValue(0);
      userRepository.manager.transaction.mockImplementation(async (run) => run(transactionManager));
    });

    // Membership phải xoá cùng transaction, không thì user đã xoá vẫn nằm trong danh sách kho.
    it('soft-deletes the user with their memberships, then revokes all sessions', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other });

      await expect(service.deleteUser(caller(), 'other-slug')).resolves.toBe(1);

      expect(transactionManager.softDelete).toHaveBeenCalledWith(WarehouseMember, {
        user: { id: 'other-id' },
      });
      expect(transactionManager.softDelete).toHaveBeenCalledWith(User, { id: 'other-id' });
      expect(tokenRevocationService.revokeAllTokensForUser).toHaveBeenCalledWith('other-id');
    });

    it('rejects deleting your own account', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other, id: 'user-id' });

      await expectUserError(
        service.deleteUser(caller(), 'my-slug'),
        UserValidation.DELETE_OWN_ACCOUNT_NOT_ALLOWED.code,
      );
      expect(userRepository.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejects deleting a warehouse manager', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other });
      warehouseRepository.count.mockResolvedValue(1);

      await expectUserError(
        service.deleteUser(caller(), 'other-slug'),
        UserValidation.USER_IS_WAREHOUSE_MANAGER.code,
      );
      expect(userRepository.manager.transaction).not.toHaveBeenCalled();
      expect(tokenRevocationService.revokeAllTokensForUser).not.toHaveBeenCalled();
    });

    it('rejects deleting an unknown user', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expectUserError(
        service.deleteUser(caller(), 'missing'),
        UserValidation.USER_NOT_FOUND.code,
      );
    });
  });

  // UNIQUE index trên `phonenumber_column` tính cả user đã xoá mềm.
  describe('phone number held by a deleted user', () => {
    it('createUser rejects with USER_PHONENUMBER_RESERVED_BY_DELETED_USER', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'gone', deletedAt: new Date() });

      await expectUserError(
        service.createUser(
          {
            phonenumber: '0900000000',
            firstName: 'A',
            lastName: 'B',
            password: 'secret',
            roleSlug: 'admin',
          },
          null,
        ),
        UserValidation.USER_PHONENUMBER_RESERVED_BY_DELETED_USER.code,
      );
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { phonenumber: '0900000000' },
        withDeleted: true,
      });
    });
  });

  // ADMIN không được sửa/khoá/đổi role của ADMIN khác — chặn bằng mã lỗi riêng, trước cả check cấp
  // role, và không bao giờ chạm DB ghi.
  describe('admin managing another admin', () => {
    const admin = caller({ roleName: RoleEnum.Admin });
    const otherAdmin = { ...other, role: { name: RoleEnum.Admin, level: 30 } } as unknown as User;

    beforeEach(() => {
      userRepository.findOneBy.mockResolvedValue({ ...otherAdmin });
      warehouseRepository.count.mockResolvedValue(0);
    });

    it.each([
      ['updateUser', () => service.updateUser(admin, 'other-slug', { firstName: 'X' })],
      ['lockUser', () => service.lockUser(admin, 'other-slug')],
      ['unlockUser', () => service.unlockUser(admin, 'other-slug')],
      ['deleteUser', () => service.deleteUser(admin, 'other-slug')],
      [
        'changeUserRole',
        () => service.changeUserRole(admin, 'other-slug', { roleSlug: 'manager' }),
      ],
    ])('%s rejects with ADMIN_CANNOT_MANAGE_ADMIN', async (_name, run) => {
      await expectUserError(run(), UserValidation.ADMIN_CANNOT_MANAGE_ADMIN.code);
      expect(roleService.assertCanManage).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(tokenRevocationService.revokeAllTokensForUser).not.toHaveBeenCalled();
    });

    it('still lets an admin edit their own profile', async () => {
      userRepository.findOneBy.mockReset();
      userRepository.findOneBy.mockResolvedValueOnce({ ...otherAdmin, id: 'user-id' });
      userRepository.save.mockImplementation(async (data) => data);

      const result = await service.updateUser(admin, 'my-slug', { firstName: 'Me' });

      expect(result.firstName).toBe('Me');
    });

    it('lets SUPER_ADMIN lock an admin', async () => {
      userRepository.save.mockImplementation(async (data) => data);

      const result = await service.lockUser(
        caller({ roleName: RoleEnum.SuperAdmin }),
        'other-slug',
      );

      expect(result.isActive).toBe(false);
    });
  });

  describe('changeUserRole', () => {
    const newRole = { id: 'manager-role-id', slug: 'manager', name: RoleEnum.Manager, level: 20 };

    beforeEach(() => {
      userRepository.findOneBy.mockResolvedValue({
        ...other,
        role: { id: 'sup-role-id', name: RoleEnum.Supervisor, level: 10 },
      });
      roleService.findBySlug.mockResolvedValue(newRole);
      userRepository.save.mockImplementation(async (data) => data);
    });

    it('assigns the new role and revokes all sessions of the user', async () => {
      const result = await service.changeUserRole(caller(), 'other-slug', { roleSlug: 'manager' });

      expect(roleService.assertCanManage).toHaveBeenCalledWith(caller(), newRole);
      expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ role: newRole }));
      expect(tokenRevocationService.revokeAllTokensForUser).toHaveBeenCalledWith('other-id');
      expect(result.roleSlug).toBe('manager');
    });

    it('rejects assigning a role the caller cannot manage', async () => {
      const forbidden = new Error('ROLE_LEVEL_FORBIDDEN');
      roleService.assertCanManage.mockResolvedValueOnce(undefined).mockRejectedValueOnce(forbidden);

      await expect(
        service.changeUserRole(caller(), 'other-slug', { roleSlug: 'manager' }),
      ).rejects.toBe(forbidden);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('rejects changing your own role', async () => {
      userRepository.findOneBy.mockResolvedValue({ ...other, id: 'user-id' });

      await expectUserError(
        service.changeUserRole(caller(), 'my-slug', { roleSlug: 'manager' }),
        UserValidation.CHANGE_OWN_ROLE_NOT_ALLOWED.code,
      );
    });
  });

  describe('findIdsByRoleId', () => {
    it('returns only the ids of users in that role', async () => {
      userRepository.find.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      expect(await service.findIdsByRoleId('role-id')).toEqual(['u1', 'u2']);
      expect(userRepository.find).toHaveBeenCalledWith({
        select: { id: true },
        where: { role: { id: 'role-id' } },
      });
    });

    it('returns an empty list when the role has no users', async () => {
      userRepository.find.mockResolvedValue([]);

      expect(await service.findIdsByRoleId('role-id')).toEqual([]);
    });
  });
});
