import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RoleService } from 'src/role/role.service';
import { RoleException } from 'src/role/role.exception';
import { AuthorityService } from 'src/authority/authority.service';
import { AuthorityException } from 'src/authority/authority.exception';
import { RbacService } from 'src/rbac/rbac.service';
import { Permission } from './permission.entity';
import { PermissionService } from './permission.service';

describe('PermissionService', () => {
  let service: PermissionService;

  const role = { id: 'role-id', slug: 'manager', name: 'MANAGER' };
  const authority = { id: 'authority-id', code: 'EXAMPLE_CREATE' };

  const permissionRepository = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const roleService = { findBySlug: jest.fn() };
  const authorityService = { findByCode: jest.fn() };
  const rbacService = { invalidateRole: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    roleService.findBySlug.mockResolvedValue(role);
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

      await service.grant('manager', 'EXAMPLE_CREATE');

      expect(permissionRepository.save).toHaveBeenCalledWith({ role, authority });
      expect(rbacService.invalidateRole).toHaveBeenCalledWith(role);
      expect(order).toEqual(['save', 'invalidate']);
    });

    it('is idempotent: an existing grant neither writes nor invalidates', async () => {
      permissionRepository.findOne.mockResolvedValue({ id: 'existing' });

      await service.grant('manager', 'EXAMPLE_CREATE');

      expect(permissionRepository.save).not.toHaveBeenCalled();
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });

    it('rejects an unknown role without touching the cache', async () => {
      roleService.findBySlug.mockResolvedValue(null);

      await expect(service.grant('ghost', 'EXAMPLE_CREATE')).rejects.toBeInstanceOf(RoleException);
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });

    it('rejects an unknown authority code without touching the cache', async () => {
      authorityService.findByCode.mockResolvedValue(null);

      await expect(service.grant('manager', 'NOPE')).rejects.toBeInstanceOf(AuthorityException);
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('deletes the permission then invalidates the role cache', async () => {
      const order: string[] = [];
      permissionRepository.delete.mockImplementation(async () => order.push('delete'));
      rbacService.invalidateRole.mockImplementation(async () => order.push('invalidate'));

      await service.revoke('manager', 'EXAMPLE_CREATE');

      expect(permissionRepository.delete).toHaveBeenCalledWith({
        role: { id: 'role-id' },
        authority: { id: 'authority-id' },
      });
      expect(rbacService.invalidateRole).toHaveBeenCalledWith(role);
      expect(order).toEqual(['delete', 'invalidate']);
    });

    it('rejects an unknown role without touching the cache', async () => {
      roleService.findBySlug.mockResolvedValue(null);

      await expect(service.revoke('ghost', 'EXAMPLE_CREATE')).rejects.toBeInstanceOf(RoleException);
      expect(rbacService.invalidateRole).not.toHaveBeenCalled();
    });
  });
});
