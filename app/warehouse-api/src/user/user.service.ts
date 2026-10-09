import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  FindOptionsOrder,
  FindOptionsWhere,
  In,
  LessThan,
  Like,
  MoreThanOrEqual,
  Not,
  Raw,
  Repository,
} from 'typeorm';
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
  UserProfileWarehouseDto,
  UserResponseDto,
} from './user.dto';
import { UserException } from './user.exception';
import { UserValidation } from './user.validation';
import { TErrorCodeValue } from 'src/app/app.validation';
import { Role } from 'src/role/role.entity';
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
import { WAREHOUSE_UNSCOPED_ROLES } from 'src/warehouse/warehouse.constants';

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
   * Lọc theo kho (`warehouseSlug`) và phạm vi kho của caller đều tra id user TRƯỚC rồi lọc `id IN`:
   * đặt điều kiện thẳng lên relation `warehouseMembers` sẽ cắt luôn danh sách `warehouses` trả về
   * chỉ còn đúng kho đang lọc. Join qua `relations` đã tự lọc row xoá mềm (thành viên, kho).
   */
  async findAll(
    query: GetAllUserRequestDto,
    filter: {
      excludedIds?: string[];
      onlyActive?: boolean;
      excludedRoleNames?: string[];
    } = {},
    currentUser?: CurrentUserDto,
  ): Promise<AppPaginatedResponseDto<UserResponseDto>> {
    const { start, end } = this.resolveCreatedAtRange(query);

    // Không gọi kèm `currentUser` (lời gọi nội bộ) thì không lọc. ADMIN/SUPER_ADMIN thấy toàn bộ
    // (cùng nhóm bypass với `WarehouseScopeGuard`). Role khác — kể cả MANAGER, role tự tạo, token
    // thiếu claim `role` (fail-closed) — chỉ thấy user là manager/thành viên của kho mình thuộc về.
    let allowedIds: string[] | undefined;
    if (currentUser && !hasRole(currentUser, ...WAREHOUSE_UNSCOPED_ROLES))
      allowedIds = await this.findUserIdsSharingWarehouse(currentUser.userId);
    if (query.warehouseSlug && (!allowedIds || allowedIds.length)) {
      const memberIds = new Set(await this.findMemberIdsOfWarehouse(query.warehouseSlug));
      allowedIds = (allowedIds ?? [...memberIds]).filter((id) => memberIds.has(id));
    }
    if (allowedIds && filter.excludedIds?.length)
      allowedIds = allowedIds.filter((id) => !filter.excludedIds.includes(id));
    // `IN ()` rỗng.
    if (allowedIds && !allowedIds.length)
      return {
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.size,
        totalPages: 0,
        hasNext: false,
        hasPrevios: query.page > 1,
      } as AppPaginatedResponseDto<UserResponseDto>;

    const where: FindOptionsWhere<User> = {};
    if (allowedIds) where.id = In(allowedIds);
    // `IN ()` rỗng là lỗi cú pháp MySQL ⇒ chỉ thêm khi mảng có phần tử.
    else if (filter.excludedIds?.length) where.id = Not(In(filter.excludedIds));
    if (query.phonenumber) where.phonenumber = Like(`%${query.phonenumber}%`);
    if (query.birthday) where.dob = query.birthday;
    if (start && end) where.createdAt = And(MoreThanOrEqual(start), LessThan(end));
    else if (start) where.createdAt = MoreThanOrEqual(start);
    else if (end) where.createdAt = LessThan(end);

    // `onlyActive` (lời gọi nội bộ, vd `available-members`) thắng `query.isActive` của client.
    // `typeof === 'boolean'`: giá trị lạ lọt qua lời gọi service trực tiếp bị coi là KHÔNG lọc.
    const isActive = filter.onlyActive ? true : query.isActive;
    if (typeof isActive === 'boolean') where.isActive = isActive;

    const roleWhere: FindOptionsWhere<Role> = {};
    if (query.roleSlug) roleWhere.slug = query.roleSlug;
    if (filter.excludedRoleNames?.length) roleWhere.name = Not(In(filter.excludedRoleNames));
    if (Object.keys(roleWhere).length) where.role = roleWhere;

    const [items, total] = await this.userRepository.findAndCount({
      where: query.name ? this.nameSearchWhere(where, query.name) : where,
      relations: { role: true, warehouseMembers: { warehouse: true } },
      order: this.buildOrder(query.sort),
      // Có relation 1-N nên TypeORM tự phân trang theo id user trước, 1 user nhiều kho không làm
      // trang bị thiếu.
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
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

  /**
   * Tìm theo tên khớp 1 trong 3: tên, họ, hoặc "họ tên" ghép 2 cột. Mảng `where` là OR giữa các
   * nhánh nên mỗi nhánh phải mang đủ điều kiện chung `base`.
   */
  private nameSearchWhere(base: FindOptionsWhere<User>, name: string): FindOptionsWhere<User>[] {
    const pattern = `%${name}%`;
    return [
      { ...base, firstName: Like(pattern) },
      { ...base, lastName: Like(pattern) },
      {
        ...base,
        // `alias` là đường dẫn cột `lastName` của alias chính; suy ra `firstName` cùng alias.
        lastName: Raw(
          (alias) => `CONCAT(${alias}, ' ', ${alias.replace(/lastName$/, 'firstName')}) LIKE :name`,
          { name: pattern },
        ),
      },
    ];
  }

  // Id user là thành viên (chưa gỡ) của kho `warehouseSlug` (kho chưa xoá).
  private async findMemberIdsOfWarehouse(warehouseSlug: string): Promise<string[]> {
    const users = await this.userRepository.find({
      select: { id: true },
      where: { warehouseMembers: { warehouse: { slug: warehouseSlug } } },
    });
    return users.map((user) => user.id);
  }

  /**
   * Id mọi user (manager + thành viên) của các kho mà `userId` là manager hoặc thành viên — cùng định
   * nghĩa "thuộc kho" với `WarehouseService.findUserWarehouse` mà `WarehouseScopeGuard` dùng. Tách 2
   * lần tra: điều kiện `where` trên `members` sẽ cắt luôn `members` được load chỉ còn row của
   * `userId`. Join qua relation đã tự lọc row xoá mềm (kho, thành viên, user).
   */
  private async findUserIdsSharingWarehouse(userId: string): Promise<string[]> {
    const callerWarehouses = await this.warehouseRepository.find({
      select: { id: true },
      where: [{ manager: { id: userId } }, { members: { user: { id: userId } } }],
    });
    if (!callerWarehouses.length) return [];

    const warehouses = await this.warehouseRepository.find({
      where: { id: In(callerWarehouses.map((warehouse) => warehouse.id)) },
      relations: { manager: true, members: { user: true } },
    });
    const ids = new Set<string>();
    for (const warehouse of warehouses) {
      if (warehouse.manager) ids.add(warehouse.manager.id);
      warehouse.members?.forEach((member) => member.user && ids.add(member.user.id));
    }
    return [...ids];
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

  /**
   * Kho của user cho `GET /auth/me`: kho user làm manager + kho user là thành viên (row chưa xoá
   * mềm). Join qua relation đã tự lọc thành viên/kho xoá mềm.
   */
  async findWarehousesOfUser(userId: string): Promise<UserProfileWarehouseDto[]> {
    const warehouses = await this.warehouseRepository.find({
      where: [{ manager: { id: userId } }, { members: { user: { id: userId } } }],
      relations: { manager: true },
      order: { name: 'ASC' },
    });

    return warehouses.map((warehouse) => ({
      slug: warehouse.slug,
      code: warehouse.code,
      name: warehouse.name,
      isManager: warehouse.manager?.id === userId,
    }));
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
   * không bao giờ nhận tên field tự do của client. Thứ tự key của object = thứ tự `ORDER BY`; field
   * lặp lại thì lần đầu thắng (giống `ORDER BY`). Luôn thêm `id` cuối cùng cho thứ tự ổn định giữa
   * các trang khi nhiều user trùng giá trị sort.
   */
  private buildOrder(sort: string[] = []): FindOptionsOrder<User> {
    const order: FindOptionsOrder<User> = {};
    for (const item of sort.length ? sort : ['createdAt:DESC']) {
      const [field, direction] = item.split(':');
      const column = USER_SORT_FIELDS[field as keyof typeof USER_SORT_FIELDS];
      if (!column || column in order) continue;
      order[column] = direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    }
    order.id = 'ASC';
    return order;
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
