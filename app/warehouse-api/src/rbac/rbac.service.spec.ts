import { Role } from 'src/role/role.entity';
import { RoleService } from 'src/role/role.service';
import { User } from 'src/user/user.entity';
import { UserService } from 'src/user/user.service';
import { RbacCacheService } from './rbac-cache.service';
import { RbacService } from './rbac.service';

describe('RbacService', () => {
  const user = {
    id: 'user-id',
    phonenumber: '0376295216',
    isActive: true,
    role: { id: 'role-id', name: 'ADMIN' },
  } as User;

  const adminRole = {
    id: 'role-id',
    name: 'ADMIN',
    permissions: [
      { authority: { code: 'EXAMPLE_CREATE' } },
      { authority: { code: 'EXAMPLE_CREATE' } }, // trùng lặp phải bị gộp
      { authority: null }, // permission mồ côi (authority đã xoá) phải bị bỏ qua
    ],
  } as unknown as Role;

  const cached = ['EXAMPLE_CREATE'];

  const cacheService = {
    get: jest.fn(),
    set: jest.fn(),
    delUsers: jest.fn(),
    getRoleAuthorities: jest.fn(),
    setRoleAuthorities: jest.fn(),
    delRole: jest.fn(),
  };
  const roleService = { findByNameWithAuthorities: jest.fn() };
  const userService = { findById: jest.fn(), findIdsByRoleId: jest.fn() };

  let service: RbacService;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.get.mockResolvedValue(null);
    cacheService.set.mockResolvedValue(undefined);
    cacheService.delUsers.mockResolvedValue(undefined);
    cacheService.getRoleAuthorities.mockResolvedValue(null);
    cacheService.setRoleAuthorities.mockResolvedValue(undefined);
    cacheService.delRole.mockResolvedValue(undefined);
    roleService.findByNameWithAuthorities.mockResolvedValue(adminRole);
    userService.findById.mockResolvedValue(user);
    userService.findIdsByRoleId.mockResolvedValue([]);

    service = new RbacService(
      cacheService as unknown as RbacCacheService,
      roleService as unknown as RoleService,
      userService as unknown as UserService,
    );
  });

  describe('resolve', () => {
    // Đây là lý do tồn tại của cache: hit thì không chạm MySQL, không đọc cả cache role.
    it('returns the cached entry without touching the database on hit', async () => {
      cacheService.get.mockResolvedValue(cached);

      expect(await service.resolve('user-id')).toEqual(cached);
      expect(userService.findById).not.toHaveBeenCalled();
      expect(cacheService.getRoleAuthorities).not.toHaveBeenCalled();
      expect(roleService.findByNameWithAuthorities).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('recomputes from the database and rewrites the cache on miss', async () => {
      expect(await service.resolve('user-id')).toEqual(cached);

      expect(userService.findById).toHaveBeenCalledWith('user-id');
      expect(roleService.findByNameWithAuthorities).toHaveBeenCalledWith('ADMIN');
      expect(cacheService.set).toHaveBeenCalledWith('user-id', cached);
    });

    it('returns null and caches nothing when the user no longer exists', async () => {
      userService.findById.mockResolvedValue(null);

      expect(await service.resolve('user-id')).toBeNull();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('returns null and caches nothing when the user is deactivated', async () => {
      userService.findById.mockResolvedValue({ ...user, isActive: false } as User);

      expect(await service.resolve('user-id')).toBeNull();
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('authoritiesOfRole', () => {
    // Yêu cầu chính của lớp cache role: Redis được hỏi TRƯỚC, DB chỉ chạy khi miss.
    it('answers from redis without querying the database on hit', async () => {
      cacheService.getRoleAuthorities.mockResolvedValue(['EXAMPLE_CREATE']);

      expect(await service.authoritiesOfRole('ADMIN')).toEqual(['EXAMPLE_CREATE']);
      expect(cacheService.getRoleAuthorities).toHaveBeenCalledWith('ADMIN');
      expect(roleService.findByNameWithAuthorities).not.toHaveBeenCalled();
      expect(cacheService.setRoleAuthorities).not.toHaveBeenCalled();
    });

    // `[]` là hit thật (role chưa được cấp quyền nào), không phải miss — nếu không thì mọi request
    // của role đó đều rơi xuống MySQL.
    it('treats an empty cached list as a hit', async () => {
      cacheService.getRoleAuthorities.mockResolvedValue([]);

      expect(await service.authoritiesOfRole('SUPERVISOR')).toEqual([]);
      expect(roleService.findByNameWithAuthorities).not.toHaveBeenCalled();
    });

    it('falls back to the database on miss, deduping codes, then writes the cache back', async () => {
      expect(await service.authoritiesOfRole('ADMIN')).toEqual(['EXAMPLE_CREATE']);

      expect(roleService.findByNameWithAuthorities).toHaveBeenCalledWith('ADMIN');
      expect(cacheService.setRoleAuthorities).toHaveBeenCalledWith('ADMIN', ['EXAMPLE_CREATE']);
    });

    it('caches an empty list for a role that exists but has no permission row', async () => {
      roleService.findByNameWithAuthorities.mockResolvedValue({ name: 'MANAGER' } as Role);

      expect(await service.authoritiesOfRole('MANAGER')).toEqual([]);
      expect(cacheService.setRoleAuthorities).toHaveBeenCalledWith('MANAGER', []);
    });

    it('caches an empty list for an unknown role instead of throwing', async () => {
      roleService.findByNameWithAuthorities.mockResolvedValue(null);

      expect(await service.authoritiesOfRole('GHOST')).toEqual([]);
      expect(cacheService.setRoleAuthorities).toHaveBeenCalledWith('GHOST', []);
    });
  });

  describe('refresh', () => {
    it('computes permissions for the user role and overwrites the cache', async () => {
      expect(await service.refresh(user)).toEqual(cached);

      expect(roleService.findByNameWithAuthorities).toHaveBeenCalledWith('ADMIN');
      expect(cacheService.set).toHaveBeenCalledWith('user-id', cached);
    });

    it('caches an empty permission list for a user without a role', async () => {
      const orphan = { ...user, role: undefined } as unknown as User;

      expect(await service.refresh(orphan)).toEqual([]);
      expect(cacheService.getRoleAuthorities).not.toHaveBeenCalled();
      expect(roleService.findByNameWithAuthorities).not.toHaveBeenCalled();
    });
  });

  describe('invalidateRole', () => {
    it('drops the cache of every user in the role, then the role authority cache', async () => {
      userService.findIdsByRoleId.mockResolvedValue(['u1', 'u2']);

      await service.invalidateRole(adminRole);

      expect(userService.findIdsByRoleId).toHaveBeenCalledWith('role-id');
      expect(cacheService.delUsers).toHaveBeenCalledWith(['u1', 'u2']);
      expect(cacheService.delRole).toHaveBeenCalledWith('ADMIN');
    });

    // Role chưa có user nào vẫn phải xoá cache role: user gán vào role đó sau này đọc quyền mới.
    it('still drops the role authority cache when the role has no users', async () => {
      await service.invalidateRole(adminRole);

      expect(cacheService.delUsers).toHaveBeenCalledWith([]);
      expect(cacheService.delRole).toHaveBeenCalledWith('ADMIN');
    });
  });
});
