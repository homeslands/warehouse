import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { RoleService } from 'src/role/role.service';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { RoleEnum } from 'src/role/role.enum';
import { AuthorityService } from 'src/authority/authority.service';
import { AuthorityException } from 'src/authority/authority.exception';
import { AuthorityValidation } from 'src/authority/authority.validation';
import { RbacService } from 'src/rbac/rbac.service';
import { CurrentUserDto } from 'src/user/user.decorator';
import { Permission } from './permission.entity';
import { PermissionService } from './permission.service';

describe('PermissionService', () => {
  let service: PermissionService;

  const role = { id: 'role-id', slug: 'manager', name: 'MANAGER', level: 20 };
  const supervisor = { id: 'supervisor-id', slug: 'supervisor', name: 'SUPERVISOR', level: 10 };
  const authority = { id: 'authority-id', code: 'EXAMPLE_CREATE' };

  // ADMIN đang có đúng authority được thao tác.
  const admin: CurrentUserDto = {
    userId: 'admin-id',
    roleName: RoleEnum.Admin,
    scope: ['EXAMPLE_CREATE', 'MANAGE_PERMISSIONS'],
  };

  const permissionRepository = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(),
    delete: jest.fn(),
  };
  // Logic so cấp nằm ở `RoleService.assertCanManage` (test riêng ở role.service.spec.ts) — ở đây
  // chỉ kiểm PermissionService có gọi nó và dừng lại khi nó từ chối.
  const roleService = {
    findBySlug: jest.fn(),
    assertCanManage: jest.fn(),
    findLowerRoles: jest.fn(),
  };
  const authorityService = { findByCode: jest.fn() };
  const rbacService = { invalidateRole: jest.fn() };

  const levelForbidden = () => new RoleException(RoleValidation.ROLE_LEVEL_FORBIDDEN);

  beforeEach(async () => {
    jest.clearAllMocks();
    roleService.findBySlug.mockResolvedValue(role);
    roleService.assertCanManage.mockResolvedValue(undefined);
    roleService.findLowerRoles.mockResolvedValue([supervisor]);
    authorityService.findByCode.mockResolvedValue(authority);
    permissionRepository.findOne.mockResolvedValue(null);
    rbacService.invalidateRole.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: getRepositoryToken(Permission), useValue: permissionRepository },
        { provide: RoleService, useValue: roleService },
        { provide: AuthorityService, useValue: authorityService },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  describe('grant', () => {
    // Cam kết của docs/specs/authority-permission.md: bật quyền có hiệu lực ngay ở request kế
    // tiếp — với cache RBAC, điều đó chỉ đúng nếu cache của role được xoá SAU khi ghi DB.
    it('saves the permission then invalidates the role cache', async () => {
      const order: string[] = [];
      permissionRepository.save.mockImplementation(async () => order.push('save'));
      rbacService.invalidateRole.mockImplementation(async () => order.push('invalidate'));

      await service.grant(admin, 'manager', 'EXAMPLE_CREATE');

      expect(roleService.assertCanManage).toHaveBeenCalledWith(admin, role);
      expect(permissionRepository.save).toHaveBeenCalledWith({ role, authority });
      expect(rbacService.invalidateRole).toHaveBeenCalledWith(role);
      expect(order).toEqual(['save', 'invalidate']);
    });

    it('is idempotent: an existing grant neither writes nor invalidates', async () => {
      permissionRepository.findOne.mockResolvedValue({ id: 'existing' });

      await service.grant(admin, 'manager', 'EXAMPLE_CREATE');

      expect(permissionRepository.save).not.toHaveBeenCalled();
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });

    it('rejects a target role of equal or higher level without writing', async () => {
      roleService.assertCanManage.mockRejectedValue(levelForbidden());

      await expect(service.grant(admin, 'manager', 'EXAMPLE_CREATE')).rejects.toMatchObject({
        code: RoleValidation.ROLE_LEVEL_FORBIDDEN.code,
      });
      expect(permissionRepository.save).not.toHaveBeenCalled();
    });

    // Cấp dưới chỉ được có tối đa quyền của người cấp: không cấp được authority mà role mình không có.
    it('rejects an authority the caller role does not own', async () => {
      const promise = service.grant(
        { ...admin, scope: ['MANAGE_PERMISSIONS'] },
        'manager',
        'EXAMPLE_CREATE',
      );

      await expect(promise).rejects.toBeInstanceOf(AuthorityException);
      await expect(promise).rejects.toMatchObject({
        code: AuthorityValidation.AUTHORITY_NOT_OWNED.code,
      });
      expect(permissionRepository.save).not.toHaveBeenCalled();
    });

    // `SUPER_ADMIN` không có row permission nào (scope rỗng) nhưng bypass — nhất quán với AuthorityGuard.
    it('lets SUPER_ADMIN grant an authority outside its (empty) scope', async () => {
      await service.grant(
        { userId: 'root-id', roleName: RoleEnum.SuperAdmin, scope: [] },
        'manager',
        'EXAMPLE_CREATE',
      );

      expect(permissionRepository.save).toHaveBeenCalledWith({ role, authority });
    });

    it('rejects an unknown role without touching the cache', async () => {
      roleService.findBySlug.mockResolvedValue(null);

      await expect(service.grant(admin, 'ghost', 'EXAMPLE_CREATE')).rejects.toBeInstanceOf(
        RoleException,
      );
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });

    it('rejects an unknown authority code without touching the cache', async () => {
      authorityService.findByCode.mockResolvedValue(null);

      await expect(service.grant(admin, 'manager', 'NOPE')).rejects.toBeInstanceOf(
        AuthorityException,
      );
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    // Thu hồi lan xuống: giữ bất biến "cấp dưới chỉ có tối đa quyền của cấp trên".
    it('deletes the permission from the role and every lower role, then invalidates them all', async () => {
      const order: string[] = [];
      permissionRepository.delete.mockImplementation(async () => order.push('delete'));
      rbacService.invalidateRole.mockImplementation(async () => order.push('invalidate'));

      await service.revoke(admin, 'manager', 'EXAMPLE_CREATE');

      expect(roleService.findLowerRoles).toHaveBeenCalledWith(20);
      expect(permissionRepository.delete).toHaveBeenCalledWith({
        role: { id: In(['role-id', 'supervisor-id']) },
        authority: { id: 'authority-id' },
      });
      expect(rbacService.invalidateRole).toHaveBeenCalledWith(role);
      expect(rbacService.invalidateRole).toHaveBeenCalledWith(supervisor);
      expect(order).toEqual(['delete', 'invalidate', 'invalidate']);
    });

    it('rejects a target role of equal or higher level without deleting', async () => {
      roleService.assertCanManage.mockRejectedValue(levelForbidden());

      await expect(service.revoke(admin, 'manager', 'EXAMPLE_CREATE')).rejects.toMatchObject({
        code: RoleValidation.ROLE_LEVEL_FORBIDDEN.code,
      });
      expect(permissionRepository.delete).not.toHaveBeenCalled();
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });

    it('rejects an unknown role without touching the cache', async () => {
      roleService.findBySlug.mockResolvedValue(null);

      await expect(service.revoke(admin, 'ghost', 'EXAMPLE_CREATE')).rejects.toBeInstanceOf(
        RoleException,
      );
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });
  });
});
