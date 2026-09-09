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

describe('UserService', () => {
  let service: UserService;

  const userRepository = {
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };
  const tokenRevocationService = {
    revokeSession: jest.fn(),
    revokeAllTokensForUser: jest.fn(),
  };
  const config: Record<string, string> = { SALT_ROUNDS: '4' };
  const configService = { get: (key: string) => config[key] };

  const caller = (overrides: Partial<CurrentUserDto> = {}): CurrentUserDto => ({
    userId: 'user-id',
    userName: '0376295216',
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
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        UserProfile,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: ConfigService, useValue: configService },
        { provide: RoleService, useValue: { findBySlug: jest.fn() } },
        { provide: TokenRevocationService, useValue: tokenRevocationService },
      ],
    }).compile();
    await module.init();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Check authority `USER_CHANGE_PASSWORD` nằm ở `@RequireAuthority` trên controller (quyền tĩnh,
  // `AuthorityGuard` chặn trước khi vào service) — ở đây chỉ còn 2 rào phụ thuộc dữ liệu: không
  // được tự trỏ vào mình, và không được đụng tới `SUPER_ADMIN`.
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

    it('rejects an unknown target user', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expectUserError(
        service.changeUserPassword(caller(), 'ghost', { newPassword: 'new-password' }),
        UserValidation.USER_NOT_FOUND.code,
      );
    });
  });
});
