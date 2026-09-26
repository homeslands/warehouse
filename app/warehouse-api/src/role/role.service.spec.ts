import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { CurrentUserDto } from 'src/user/user.decorator';
import { Role } from './role.entity';
import { RoleProfile } from './role.mapper';
import { RoleService } from './role.service';
import { RoleEnum } from './role.enum';
import { RoleException } from './role.exception';
import { RoleValidation } from './role.validation';

describe('RoleService', () => {
  let service: RoleService;

  const roles: Record<string, Partial<Role>> = {
    SUPERVISOR: { id: 'supervisor-id', name: 'SUPERVISOR', level: 10 },
    MANAGER: { id: 'manager-id', name: 'MANAGER', level: 20 },
    ADMIN: { id: 'admin-id', name: 'ADMIN', level: 30 },
  };

  const roleRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ ...data, id: 'new-id', slug: 'new-slug', permissions: [] })),
  };

  const actor = (roleName?: string): CurrentUserDto => ({ userId: 'u', roleName, scope: [] });

  const expectForbidden = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toBeInstanceOf(RoleException);
    await expect(promise).rejects.toMatchObject({
      code: RoleValidation.ROLE_LEVEL_FORBIDDEN.code,
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // `findByName` của actor → tra theo tên; `findOneBy({ name })` ở `create` (check trùng tên) cũng
    // đi qua đây nên tên mới trả `null`.
    roleRepository.findOneBy.mockImplementation(async (where: { name?: string; slug?: string }) =>
      where.name ? (roles[where.name] ?? null) : null,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        RoleProfile,
        { provide: getRepositoryToken(Role), useValue: roleRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
      ],
    }).compile();
    await module.init();

    service = module.get<RoleService>(RoleService);
  });

  describe('assertCanManage', () => {
    it('allows a strictly lower level', async () => {
      await expect(service.assertCanManage(actor('ADMIN'), roles.MANAGER as Role)).resolves.toBe(
        undefined,
      );
    });

    // Ngang cấp cũng chặn: nếu không, ADMIN tự cấp thêm quyền cho chính role ADMIN.
    it('rejects the same level', async () => {
      await expectForbidden(service.assertCanManage(actor('ADMIN'), roles.ADMIN as Role));
    });

    it('rejects a higher level', async () => {
      await expectForbidden(service.assertCanManage(actor('MANAGER'), 30));
    });

    // Fail-closed: token không có claim `role` / role đã bị xoá thì không quản lý được ai.
    it('rejects when the caller has no role claim or the role no longer exists', async () => {
      await expectForbidden(service.assertCanManage(actor(undefined), 1));
      await expectForbidden(service.assertCanManage(actor('GHOST'), 1));
    });

    it('lets SUPER_ADMIN manage any level without a DB lookup', async () => {
      await expect(service.assertCanManage(actor(RoleEnum.SuperAdmin), 100)).resolves.toBe(
        undefined,
      );
      expect(roleRepository.findOneBy).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    // Role mới không bị giới hạn trong RoleEnum — vị trí trong thứ bậc do `level` quyết định.
    it('creates a role with a name outside RoleEnum when its level is below the caller', async () => {
      const result = await service.create(actor('ADMIN'), { name: 'TEAM_LEAD', level: 15 });

      expect(roleRepository.save).toHaveBeenCalledWith({
        name: 'TEAM_LEAD',
        description: undefined,
        level: 15,
      });
      expect(result).toMatchObject({ name: 'TEAM_LEAD', level: 15, authorityCodes: [] });
    });

    it('rejects creating a role at or above the caller level', async () => {
      await expectForbidden(service.create(actor('ADMIN'), { name: 'CO_ADMIN', level: 30 }));
      expect(roleRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects updating a role at or above the caller level', async () => {
      roleRepository.findOneBy.mockImplementation(
        async (where: { name?: string; slug?: string }) =>
          where.slug ? roles.ADMIN : (roles[where.name!] ?? null),
      );

      await expectForbidden(service.update(actor('ADMIN'), 'admin', { description: 'x' }));
      expect(roleRepository.save).not.toHaveBeenCalled();
    });
  });
});
