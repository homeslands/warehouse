import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import {
  ChangeUserPasswordRequestDto,
  ChangeUserPasswordResponseDto,
  ChangeUserRoleRequestDto,
  CreateUserRequestDto,
  GetAllUserRequestDto,
  UpdateUserRequestDto,
  UserResponseDto,
} from './user.dto';
import { UserException } from './user.exception';
import { UserValidation } from './user.validation';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { RoleService } from 'src/role/role.service';
import { RoleEnum } from 'src/role/role.enum';
import { CurrentUserDto } from './user.decorator';
import { TokenRevocationService } from 'src/auth/token-revocation.service';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { pickDefined } from 'src/shared/utils/obj.util';

@Injectable()
export class UserService {
  private readonly saltRounds: number;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectMapper() private readonly mapper: Mapper,
    private readonly configService: ConfigService,
    private readonly roleService: RoleService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {
    this.saltRounds = parseInt(this.configService.get('SALT_ROUNDS'), 10);
  }

  /**
   * `actor` = người gọi API; chỉ được gán role có cấp thấp hơn role của mình (không thì ai có
   * `USER_CREATE` cũng tạo được tài khoản `SUPER_ADMIN`). `null` CHỈ dành cho hệ thống tự tạo
   * (`RootUserSeeder`) — không có người thao tác nên không có cấp để so.
   */
  async createUser(
    dto: CreateUserRequestDto,
    actor: CurrentUserDto | null,
  ): Promise<UserResponseDto> {
    const existed = await this.userRepository.findOneBy({ phonenumber: dto.phonenumber });
    if (existed) throw new UserException(UserValidation.USER_PHONENUMBER_DOES_EXIST);

    const role = await this.roleService.findBySlug(dto.roleSlug);
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);
    if (actor) await this.roleService.assertCanManage(actor, role);

    const data = this.mapper.map(dto, CreateUserRequestDto, User);
    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);

    const user = this.userRepository.create({
      ...data,
      password: hashedPassword,
      role,
    });
    const created = await this.userRepository.save(user);
    return this.mapper.map(created, User, UserResponseDto);
  }

  async findAll(query: GetAllUserRequestDto): Promise<AppPaginatedResponseDto<UserResponseDto>> {
    const options: FindManyOptions<User> = {
      where: query.roleSlug ? { role: { slug: query.roleSlug } } : undefined,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    };
    const [items, total] = await this.userRepository.findAndCount(options);
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, User, UserResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<UserResponseDto>;
  }

  async findByPhoneNumber(phonenumber: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phonenumber },
      relations: { role: { permissions: { authority: { authorityGroup: true } } } },
    });
  }

  // Cho `RbacService.invalidateRole`: id của mọi user thuộc 1 role, để xoá cache quyền của họ khi
  // admin bật/tắt quyền của role đó. Chỉ select `id`, không load entity.
  async findIdsByRoleId(roleId: string): Promise<string[]> {
    const users = await this.userRepository.find({
      select: { id: true },
      where: { role: { id: roleId } },
    });
    return users.map((user) => user.id);
  }

  async findBySlug(slug: string): Promise<User | null> {
    return this.userRepository.findOneBy({ slug });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);
    await this.userRepository.update({ id }, { password: hashedPassword });
  }

  /**
   * Đổi mật khẩu HỘ user khác (`POST /users/{userSlug}/change-password`) — quyền đã được
   * `AuthorityGuard` chặn bằng `@RequireAuthority(AuthorityCode.UserChangePassword)` (`SUPER_ADMIN`
   * bypass) trước khi vào đây. Không hỏi mật khẩu hiện tại vì người gọi
   * không biết mật khẩu cũ của user đó — tự đổi mật khẩu của mình thì đi `POST /auth/change-password`.
   *
   * Chỉ thu hồi phiên của user BỊ ĐỔI; token của người gọi không bị đụng tới, nên không trả token.
   */
  async changeUserPassword(
    currentUser: CurrentUserDto,
    userSlug: string,
    dto: ChangeUserPasswordRequestDto,
  ): Promise<ChangeUserPasswordResponseDto> {
    const target = await this.findBySlug(userSlug);
    if (!target) throw new UserException(UserValidation.USER_NOT_FOUND);

    this.assertCanChangeOtherPassword(currentUser, target);

    await this.updatePassword(target.id, dto.newPassword);
    await this.tokenRevocationService.revokeAllTokensForUser(target.id);

    return { userSlug: target.slug };
  }

  /**
   * Endpoint đổi hộ KHÔNG dùng để tự đổi: nó không hỏi mật khẩu hiện tại, cho phép trỏ vào chính
   * mình là mở đường cho người cầm access token bị đánh cắp của admin đổi mật khẩu tài khoản đó mà
   * không cần biết mật khẩu cũ. Bắt đi qua `POST /auth/change-password`.
   *
   * Chặn thêm leo thang đặc quyền: người không phải `SUPER_ADMIN` không được đổi mật khẩu của một
   * `SUPER_ADMIN` — nếu không, bất kỳ `ADMIN`/`MANAGER` nào đều có thể reset mật khẩu tài khoản
   * root rồi đăng nhập bằng chính nó.
   */
  private assertCanChangeOtherPassword(currentUser: CurrentUserDto, target: User): void {
    if (target.id === currentUser.userId) {
      throw new UserException(UserValidation.CHANGE_OWN_PASSWORD_NOT_ALLOWED);
    }
    if (currentUser.roleName === RoleEnum.SuperAdmin) return;
    if (target.role?.name === RoleEnum.SuperAdmin) {
      throw new UserException(UserValidation.CHANGE_PASSWORD_FORBIDDEN);
    }
  }

  /**
   * `PATCH /users/{userSlug}` — partial update hồ sơ. Chỉ sửa được user có role THẤP HƠN mình
   * (giống `createUser`), nếu không ADMIN sửa được số điện thoại đăng nhập của SUPER_ADMIN.
   */
  async updateUser(
    currentUser: CurrentUserDto,
    userSlug: string,
    dto: UpdateUserRequestDto,
  ): Promise<UserResponseDto> {
    const target = await this.findTargetOrFail(userSlug);
    if (target.id !== currentUser.userId) await this.assertCanManageUser(currentUser, target);

    const data = pickDefined(this.mapper.map(dto, UpdateUserRequestDto, User));
    if (data.phonenumber !== undefined && data.phonenumber !== target.phonenumber) {
      const existed = await this.userRepository.findOneBy({ phonenumber: data.phonenumber });
      if (existed) throw new UserException(UserValidation.USER_PHONENUMBER_DOES_EXIST);
    }

    Object.assign(target, data);
    const updated = await this.userRepository.save(target);
    return this.mapper.map(updated, User, UserResponseDto);
  }

  /**
   * `POST /users/{userSlug}/lock` — `isActive = false` + thu hồi mọi phiên (login/`RbacService`
   * đã chặn user `!isActive`, thu hồi là để token đang còn hạn chết ngay ở request kế tiếp).
   * Không khoá được manager của kho nào: phải đổi manager kho trước. Khoá lại user đã khoá là no-op.
   */
  async lockUser(currentUser: CurrentUserDto, userSlug: string): Promise<UserResponseDto> {
    const target = await this.findTargetOrFail(userSlug);
    if (target.id === currentUser.userId) {
      throw new UserException(UserValidation.LOCK_OWN_ACCOUNT_NOT_ALLOWED);
    }
    await this.assertCanManageUser(currentUser, target);

    const managedWarehouses = await this.warehouseRepository.count({
      where: { manager: { id: target.id } },
    });
    if (managedWarehouses > 0) throw new UserException(UserValidation.USER_IS_WAREHOUSE_MANAGER);

    if (target.isActive) {
      target.isActive = false;
      await this.userRepository.save(target);
    }
    await this.tokenRevocationService.revokeAllTokensForUser(target.id);
    return this.mapper.map(target, User, UserResponseDto);
  }

  /**
   * `POST /users/{userSlug}/change-role` — cả role hiện tại lẫn role mới đều phải thấp hơn role của
   * người gọi. Thu hồi mọi phiên vì `role` là claim trong JWT: token cũ vẫn mang role cũ tới khi hết
   * hạn; login lại sẽ ký role mới và ghi đè cache quyền `rbac:user:{id}`.
   */
  async changeUserRole(
    currentUser: CurrentUserDto,
    userSlug: string,
    dto: ChangeUserRoleRequestDto,
  ): Promise<UserResponseDto> {
    const target = await this.findTargetOrFail(userSlug);
    if (target.id === currentUser.userId) {
      throw new UserException(UserValidation.CHANGE_OWN_ROLE_NOT_ALLOWED);
    }
    await this.assertCanManageUser(currentUser, target);

    const role = await this.roleService.findBySlug(dto.roleSlug);
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);
    await this.roleService.assertCanManage(currentUser, role);

    if (target.role?.id !== role.id) {
      target.role = role;
      await this.userRepository.save(target);
      await this.tokenRevocationService.revokeAllTokensForUser(target.id);
    }
    return this.mapper.map(target, User, UserResponseDto);
  }

  private async findTargetOrFail(userSlug: string): Promise<User> {
    const target = await this.findBySlug(userSlug);
    if (!target) throw new UserException(UserValidation.USER_NOT_FOUND);
    return target;
  }

  // User không có role (dữ liệu rác) thì coi như cấp thấp nhất — vẫn quản lý được để sửa lại.
  private async assertCanManageUser(currentUser: CurrentUserDto, target: User): Promise<void> {
    if (target.role) await this.roleService.assertCanManage(currentUser, target.role);
  }
}
