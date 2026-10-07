import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
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
import { TErrorCodeValue } from 'src/app/app.validation';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { RoleService } from 'src/role/role.service';
import { RoleEnum } from 'src/role/role.enum';
import { hasRole } from 'src/role/role.decorator';
import { CurrentUserDto } from './user.decorator';
import { USER_SORT_FIELDS } from './user.constants';
import { TokenRevocationService } from 'src/auth/token-revocation.service';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseMember } from 'src/warehouse/warehouse-member.entity';
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
    await this.assertPhonenumberIsFree(dto.phonenumber);

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

  /**
   * `GET /users` (và `GET /warehouses/{slug}/available-members`). Mỗi user kèm `role` và danh sách
   * kho user là thành viên.
   *
   * `filter` chỉ dành cho caller nội bộ, không lộ ra query string: `excludedIds` loại user đã gắn,
   * `onlyActive` bỏ user đang bị khoá, `excludedRoleNames` loại user theo tên role.
   *
   * Dùng QueryBuilder thay vì find options vì 2 chỗ find options không làm được: lọc theo kho bằng
   * `EXISTS` (lọc thẳng trên join `warehouseMembers` sẽ cắt luôn danh sách `warehouses` trả về chỉ
   * còn đúng kho đang lọc) và tìm theo "họ tên" ghép 2 cột. Join tự viết nên phải tự thêm
   * `deletedAt IS NULL` cho bảng join — TypeORM chỉ tự lọc xoá mềm cho alias chính.
   */
  async findAll(
    query: GetAllUserRequestDto,
    filter: { excludedIds?: string[]; onlyActive?: boolean; excludedRoleNames?: string[] } = {},
  ): Promise<AppPaginatedResponseDto<UserResponseDto>> {
    const { start, end } = this.resolveCreatedAtRange(query);

    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.warehouseMembers', 'member', 'member.deletedAt IS NULL')
      .leftJoinAndSelect('member.warehouse', 'warehouse', 'warehouse.deletedAt IS NULL');

    if (query.roleSlug) qb.andWhere('role.slug = :roleSlug', { roleSlug: query.roleSlug });
    if (query.name) {
      qb.andWhere(
        new Brackets((sub) =>
          sub
            .where('user.firstName LIKE :name')
            .orWhere('user.lastName LIKE :name')
            .orWhere("CONCAT(user.lastName, ' ', user.firstName) LIKE :name"),
        ),
        { name: `%${query.name}%` },
      );
    }
    if (query.phonenumber)
      qb.andWhere('user.phonenumber LIKE :phonenumber', {
        phonenumber: `%${query.phonenumber}%`,
      });
    if (query.birthday) qb.andWhere('user.dob = :birthday', { birthday: query.birthday });
    if (start) qb.andWhere('user.createdAt >= :start', { start });
    if (end) qb.andWhere('user.createdAt < :end', { end });
    if (query.warehouseSlug) {
      qb.andWhere(
        (outer) =>
          'EXISTS ' +
          outer
            .subQuery()
            .select('1')
            .from(WarehouseMember, 'wm')
            .innerJoin('wm.warehouse', 'wmWarehouse', 'wmWarehouse.deletedAt IS NULL')
            .where('wm.user = user.id')
            .andWhere('wm.deletedAt IS NULL')
            .andWhere('wmWarehouse.slug = :warehouseSlug')
            .getQuery(),
        { warehouseSlug: query.warehouseSlug },
      );
    }

    // `onlyActive` (lời gọi nội bộ, vd `available-members`) thắng `query.isActive` của client.
    // `typeof === 'boolean'`: giá trị lạ lọt qua lời gọi service trực tiếp bị coi là KHÔNG lọc.
    const isActive = filter.onlyActive ? true : query.isActive;
    if (typeof isActive === 'boolean') qb.andWhere('user.isActive = :isActive', { isActive });
    // `IN ()` rỗng là lỗi cú pháp MySQL ⇒ chỉ thêm khi mảng có phần tử.
    if (filter.excludedIds?.length)
      qb.andWhere('user.id NOT IN (:...excludedIds)', { excludedIds: filter.excludedIds });
    if (filter.excludedRoleNames?.length)
      qb.andWhere('role.name NOT IN (:...excludedRoleNames)', {
        excludedRoleNames: filter.excludedRoleNames,
      });

    this.applySort(qb, query.sort);

    // `skip`/`take` (không phải `offset`/`limit`): có join 1-N nên TypeORM phải phân trang theo id
    // user trước, nếu không 1 user nhiều kho chiếm nhiều dòng và trang bị thiếu.
    const [items, total] = await qb
      .skip((query.page - 1) * query.size)
      .take(query.size)
      .getManyAndCount();
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

    await this.assertCanChangeOtherPassword(currentUser, target);

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
   * root rồi đăng nhập bằng chính nó. Tổng quát hơn: role của người gọi có cấp THẤP HƠN role của
   * target cũng bị chặn (vd `MANAGER` đổi mật khẩu `ADMIN`). Ngang cấp vẫn cho đổi. User không có
   * role (dữ liệu rác) coi như cấp thấp nhất.
   */
  private async assertCanChangeOtherPassword(
    currentUser: CurrentUserDto,
    target: User,
  ): Promise<void> {
    if (target.id === currentUser.userId) {
      throw new UserException(UserValidation.CHANGE_OWN_PASSWORD_NOT_ALLOWED);
    }
    if (currentUser.roleName === RoleEnum.SuperAdmin) return;
    if (target.role?.name === RoleEnum.SuperAdmin) {
      throw new UserException(UserValidation.CHANGE_PASSWORD_FORBIDDEN);
    }
    if (target.role && target.role.level > (await this.roleService.actorLevel(currentUser))) {
      throw new UserException(UserValidation.CHANGE_PASSWORD_FORBIDDEN);
    }
  }

  /**
   * `PATCH /users/{userSlug}` — partial update hồ sơ. Tự sửa hồ sơ của mình thì luôn được; sửa user
   * khác thì role của họ phải THẤP HƠN mình (giống `createUser`), nếu không ADMIN sửa được số điện
   * thoại đăng nhập của SUPER_ADMIN — và ADMIN không sửa được ADMIN khác (`ADMIN_CANNOT_MANAGE_ADMIN`).
   */
  async updateUser(
    currentUser: CurrentUserDto,
    userSlug: string,
    dto: UpdateUserRequestDto,
  ): Promise<UserResponseDto> {
    const target = await this.findTargetOrFail(userSlug);
    if (target.id !== currentUser.userId) await this.assertCanManageUser(currentUser, target);

    const data = pickDefined(this.mapper.map(dto, UpdateUserRequestDto, User));
    if (data.phonenumber !== undefined && data.phonenumber !== target.phonenumber)
      await this.assertPhonenumberIsFree(data.phonenumber);

    Object.assign(target, data);
    const updated = await this.userRepository.save(target);
    return this.mapper.map(updated, User, UserResponseDto);
  }

  /**
   * `PUT /users/{userSlug}/lock` — `isActive = false` + thu hồi mọi phiên (login/`RbacService` đã chặn
   * user `!isActive`, thu hồi là để token đang còn hạn chết ngay ở request kế tiếp). Khoá lại user đã
   * khoá là no-op (vẫn thu hồi phiên).
   */
  async lockUser(currentUser: CurrentUserDto, userSlug: string): Promise<UserResponseDto> {
    const target = await this.findTargetOrFail(userSlug);
    await this.assertCanDeactivate(
      currentUser,
      target,
      UserValidation.LOCK_OWN_ACCOUNT_NOT_ALLOWED,
    );

    if (target.isActive) {
      target.isActive = false;
      await this.userRepository.save(target);
    }
    await this.tokenRevocationService.revokeAllTokensForUser(target.id);
    return this.mapper.map(target, User, UserResponseDto);
  }

  /**
   * `PUT /users/{userSlug}/unlock` — `isActive = true`. Không cần đụng Redis: phiên cũ đã bị thu hồi
   * lúc khoá (user phải login lại), còn `RbacService.resolve` không cache user bị khoá nên lần login
   * kế tiếp tự nạp lại quyền. Mở khoá user đang hoạt động là no-op.
   */
  async unlockUser(currentUser: CurrentUserDto, userSlug: string): Promise<UserResponseDto> {
    const target = await this.findTargetOrFail(userSlug);
    await this.assertCanManageUser(currentUser, target);

    if (!target.isActive) {
      target.isActive = true;
      await this.userRepository.save(target);
    }
    return this.mapper.map(target, User, UserResponseDto);
  }

  /**
   * `DELETE /users/{userSlug}` — xoá mềm user (`deletedAt`) cùng mọi row thành viên kho của họ trong
   * 1 transaction, rồi thu hồi mọi phiên. Rào giống `lockUser`. `phonenumber` vẫn bị giữ bởi UNIQUE
   * index (tính cả row xoá mềm) — tạo lại user cùng số trả `USER_PHONENUMBER_RESERVED_BY_DELETED_USER`.
   */
  async deleteUser(currentUser: CurrentUserDto, userSlug: string): Promise<number> {
    const target = await this.findTargetOrFail(userSlug);
    await this.assertCanDeactivate(
      currentUser,
      target,
      UserValidation.DELETE_OWN_ACCOUNT_NOT_ALLOWED,
    );

    await this.userRepository.manager.transaction(async (manager) => {
      await manager.softDelete(WarehouseMember, { user: { id: target.id } });
      await manager.softDelete(User, { id: target.id });
    });
    await this.tokenRevocationService.revokeAllTokensForUser(target.id);
    return 1;
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

  /**
   * Rào chung cho khoá/xoá: không tự khoá/xoá chính mình, phải quản lý được target, và target không
   * được đang là manager của kho nào — bỏ kho lại không người phụ trách, phải đổi manager kho trước.
   */
  private async assertCanDeactivate(
    currentUser: CurrentUserDto,
    target: User,
    ownAccountError: TErrorCodeValue,
  ): Promise<void> {
    if (target.id === currentUser.userId) throw new UserException(ownAccountError);
    await this.assertCanManageUser(currentUser, target);

    const managedWarehouses = await this.warehouseRepository.count({
      where: { manager: { id: target.id } },
    });
    if (managedWarehouses > 0) throw new UserException(UserValidation.USER_IS_WAREHOUSE_MANAGER);
  }

  /**
   * UNIQUE index của `phonenumber_column` KHÔNG bỏ qua row xoá mềm ⇒ tra kèm `withDeleted` và tách 2
   * mã lỗi, thay vì để MySQL ném `ER_DUP_ENTRY` thành 500.
   */
  private async assertPhonenumberIsFree(phonenumber: string): Promise<void> {
    const existed = await this.userRepository.findOne({
      where: { phonenumber },
      withDeleted: true,
    });
    if (!existed) return;
    throw new UserException(
      existed.deletedAt
        ? UserValidation.USER_PHONENUMBER_RESERVED_BY_DELETED_USER
        : UserValidation.USER_PHONENUMBER_DOES_EXIST,
    );
  }

  /**
   * `YYYY-MM-DD` = trọn ngày theo giờ server: `startDate` từ 00:00, `endDate` tới hết ngày (so sánh
   * `< 00:00 ngày kế`). ISO 8601 đầy đủ thì dùng nguyên mốc, `endDate` vẫn bao gồm.
   */
  private resolveCreatedAtRange(query: GetAllUserRequestDto): { start?: Date; end?: Date } {
    const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
    const toLocalMidnight = (value: string) => {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    };

    let start: Date | undefined;
    let end: Date | undefined;
    if (query.startDate)
      start = isDateOnly(query.startDate)
        ? toLocalMidnight(query.startDate)
        : new Date(query.startDate);
    if (query.endDate) {
      if (isDateOnly(query.endDate)) {
        end = toLocalMidnight(query.endDate);
        end.setDate(end.getDate() + 1);
      } else {
        end = new Date(new Date(query.endDate).getTime() + 1);
      }
    }
    if (start && end && start >= end)
      throw new UserException(UserValidation.USER_DATE_RANGE_INVALID);
    return { start, end };
  }

  /**
   * `sort` đã được DTO whitelist (`USER_SORT_REGEX`); map qua `USER_SORT_FIELDS` thêm 1 lần nữa để
   * không bao giờ nối chuỗi client vào `ORDER BY`. Luôn thêm `user.id` cuối cùng cho thứ tự ổn định
   * giữa các trang khi nhiều user trùng giá trị sort.
   */
  private applySort(qb: SelectQueryBuilder<User>, sort: string[] = []): void {
    const orders = sort.length ? sort : ['createdAt:DESC'];
    orders.forEach((item, index) => {
      const [field, direction] = item.split(':');
      const column = USER_SORT_FIELDS[field as keyof typeof USER_SORT_FIELDS];
      if (!column) return;
      const order = direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      if (index === 0) qb.orderBy(column, order);
      else qb.addOrderBy(column, order);
    });
    qb.addOrderBy('user.id', 'ASC');
  }

  private async findTargetOrFail(userSlug: string): Promise<User> {
    const target = await this.findBySlug(userSlug);
    if (!target) throw new UserException(UserValidation.USER_NOT_FOUND);
    return target;
  }

  /**
   * Rào cho mọi thao tác trên user KHÁC (sửa / khoá / đổi role). ADMIN đụng ADMIN khác bị chặn
   * bằng mã lỗi riêng (`ADMIN_CANNOT_MANAGE_ADMIN`) trước cả check cấp role, để client phân biệt
   * được với `ROLE_LEVEL_FORBIDDEN` chung chung — chỉ `SUPER_ADMIN` mới sửa/khoá được tài khoản ADMIN.
   * User không có role (dữ liệu rác) thì coi như cấp thấp nhất — vẫn quản lý được để sửa lại.
   */
  private async assertCanManageUser(currentUser: CurrentUserDto, target: User): Promise<void> {
    if (hasRole(currentUser, RoleEnum.Admin) && target.role?.name === RoleEnum.Admin) {
      throw new UserException(UserValidation.ADMIN_CANNOT_MANAGE_ADMIN);
    }
    if (target.role) await this.roleService.assertCanManage(currentUser, target.role);
  }
}
