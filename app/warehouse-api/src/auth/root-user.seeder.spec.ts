import { ConfigService } from '@nestjs/config';
import { Logger } from 'winston';
import { UserService } from 'src/user/user.service';
import { RoleService } from 'src/role/role.service';
import { RbacService } from 'src/rbac/rbac.service';
import { User } from 'src/user/user.entity';
import { RootUserSeeder } from './root-user.seeder';

describe('RootUserSeeder', () => {
  const userService = { findByPhoneNumber: jest.fn(), createUser: jest.fn() };
  const roleService = { findByName: jest.fn() };
  const rbacService = { refresh: jest.fn() };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const root = { id: 'root-id', isActive: true, role: { name: 'SUPER_ADMIN' } } as unknown as User;

  let seeder: RootUserSeeder;

  beforeEach(() => {
    jest.clearAllMocks();
    seeder = new RootUserSeeder(
      userService as unknown as UserService,
      roleService as unknown as RoleService,
      rbacService as unknown as RbacService,
      { get: () => undefined } as unknown as ConfigService,
      logger as unknown as Logger,
    );
  });

  it('refreshes the RBAC cache of an existing root user without re-creating it', async () => {
    userService.findByPhoneNumber.mockResolvedValue(root);

    await seeder.onApplicationBootstrap();

    expect(userService.createUser).not.toHaveBeenCalled();
    expect(rbacService.refresh).toHaveBeenCalledWith(root);
  });

  it('creates the root user as the system (no actor) then warms its cache', async () => {
    userService.findByPhoneNumber.mockResolvedValueOnce(null).mockResolvedValueOnce(root);
    roleService.findByName.mockResolvedValue({ slug: 'super-admin' });

    await seeder.onApplicationBootstrap();

    expect(userService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ roleSlug: 'super-admin' }),
      null,
    );
    expect(rbacService.refresh).toHaveBeenCalledWith(root);
  });

  it('does not warm the cache of an inactive root user', async () => {
    userService.findByPhoneNumber.mockResolvedValue({ ...root, isActive: false });

    await seeder.onApplicationBootstrap();

    expect(rbacService.refresh).not.toHaveBeenCalled();
  });

  // Lỗi ở hook bootstrap làm NestFactory.create() reject ⇒ cả app chết. Chưa chạy migration
  // (`Unknown column ...`) hay mất kết nối DB chỉ được log.
  it('logs a database error instead of throwing (the app must still start)', async () => {
    userService.findByPhoneNumber.mockRejectedValue(
      new Error("Unknown column 'User__User_role.level_column' in 'field list'"),
    );

    await expect(seeder.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown column'),
      expect.objectContaining({ context: 'RootUserSeeder' }),
    );
  });
});
