import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindOptionsRelations, FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AssignWarehouseMemberRequestDto,
  AssignWarehouseManagerRequestDto,
  CreateWarehouseRequestDto,
  GetAllWarehouseRequestDto,
  GetMyWarehouseRequestDto,
  UpdateWarehouseRequestDto,
  WarehouseMemberResponseDto,
  WarehouseResponseDto,
} from './warehouse.dto';
import { Warehouse } from './warehouse.entity';
import { WarehouseMember } from './warehouse-member.entity';
import { WarehouseException } from './warehouse.exception';
import { WarehouseValidation } from './warehouse.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { UserService } from 'src/user/user.service';
import { RoleEnum } from 'src/role/role.enum';
import { WAREHOUSE_SCOPED_ROLES } from './warehouse.constants';
import { hasRole } from 'src/role/role.decorator';
import { CurrentUserDto, CurrentUserWarehouseDto } from 'src/user/user.decorator';
import { pickDefined } from 'src/shared/utils/obj.util';
import { GetAllUserRequestDto, UserResponseDto } from 'src/user/user.dto';

/**
 * `manager`/`store` cố tình KHÔNG `eager` trên entity (xem `warehouse.entity.ts`), nên mọi read path
 * phải truyền hằng này — thiếu nó thì response im lặng mất `managerSlug`/`storeSlug`, không có lỗi
 * nào báo ra. `store` là inverse side (FK nằm ở `store_tbl`) nên `save(warehouse)` không ghi gì
 * sang nó khi giá trị không đổi.
 */
const WAREHOUSE_RELATIONS: FindOptionsRelations<Warehouse> = { manager: true, store: true };

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(WarehouseMember)
    private readonly warehouseMemberRepository: Repository<WarehouseMember>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly userService: UserService,
  ) {}

  /**
   * Thông tin kho `slug` kèm vai trò của user `userId` trong đó; `null` = kho không tồn tại, `false`
   * = user không phải manager lẫn member (row chưa xoá mềm). Dùng bởi `WarehouseScopeGuard`. Manager
   * trả ngay sau 1 query, chỉ tra bảng thành viên khi không phải manager.
   */
  async findUserWarehouse(
    slug: string,
    userId: string,
  ): Promise<CurrentUserWarehouseDto | false | null> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { slug },
      relations: { manager: true },
    });
    if (!warehouse) return null;

    const isManager = warehouse.manager?.id === userId;
    // `existsBy` mặc định đã loại row xoá mềm ⇒ member đã bị gỡ không còn quyền.
    if (
      !isManager &&
      !(await this.warehouseMemberRepository.existsBy({
        warehouse: { id: warehouse.id },
        user: { id: userId },
      }))
    )
      return false;

    const { id, code, name } = warehouse;
    return { id, slug: warehouse.slug, code, name, isManager };
  }

  async createWarehouse(dto: CreateWarehouseRequestDto): Promise<WarehouseResponseDto> {
    const context = `${WarehouseService.name}.${this.createWarehouse.name}`;
    const data = this.mapper.map(dto, CreateWarehouseRequestDto, Warehouse);

    await this.assertCodeIsFree(data.code);
    await this.assertNameIsFree(data.name);

    const created = await this.warehouseRepository.save(this.warehouseRepository.create(data));
    this.logger.log(`Warehouse created: ${created.id}`, context);
    return this.mapper.map(created, Warehouse, WarehouseResponseDto);
  }

  /**
   * `MANAGER`/`SUPERVISOR` chỉ thấy kho mình là manager HOẶC là thành viên (`warehouse_member_tbl`,
   * member đã gỡ — xoá mềm — không tính: TypeORM tự thêm `deleted_at IS NULL` vào join). Filter
   * `managerSlug`/`hasManager` của query bị bỏ qua để không mở rộng được ra kho của người khác.
   * `ADMIN`/`SUPER_ADMIN` thấy toàn bộ.
   */
  async findAll(
    query: GetAllWarehouseRequestDto,
    currentUser?: CurrentUserDto,
  ): Promise<AppPaginatedResponseDto<WarehouseResponseDto>> {
    const where: FindOptionsWhere<Warehouse> = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (hasRole(currentUser, ...WAREHOUSE_SCOPED_ROLES)) {
      const userId = currentUser.userId;
      // Mảng `where` = OR; mỗi nhánh phải mang lại filter chung (`isActive`).
      return this.paginate(
        [
          { ...where, manager: { id: userId } },
          { ...where, members: { user: { id: userId } } },
        ],
        query,
      );
    }
    if (query.managerSlug) where.manager = { slug: query.managerSlug };
    else if (query.hasManager === true) where.manager = Not(IsNull());
    else if (query.hasManager === false) where.manager = IsNull();

    return this.paginate(where, query);
  }

  async findMine(
    userId: string,
    query: GetMyWarehouseRequestDto,
  ): Promise<AppPaginatedResponseDto<WarehouseResponseDto>> {
    const where: FindOptionsWhere<Warehouse> = { manager: { id: userId } };
    if (query.isActive !== undefined) where.isActive = query.isActive;

    return this.paginate(where, query);
  }

  async findOne(slug: string): Promise<WarehouseResponseDto> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { slug },
      relations: WAREHOUSE_RELATIONS,
    });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    return this.mapper.map(warehouse, Warehouse, WarehouseResponseDto);
  }

  async updateWarehouse(
    slug: string,
    dto: UpdateWarehouseRequestDto,
  ): Promise<WarehouseResponseDto> {
    const context = `${WarehouseService.name}.${this.updateWarehouse.name}`;
    const warehouse = await this.warehouseRepository.findOne({
      where: { slug },
      relations: WAREHOUSE_RELATIONS,
    });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);

    // PATCH partial: `pickDefined` bỏ mọi field client không gửi ⇒ field vắng mặt giữ nguyên giá
    // trị cũ. Check trùng chỉ chạy khi field CÓ mặt VÀ đổi giá trị — thiếu rào `undefined` thì
    // `assertCodeIsFree(undefined)` sẽ tra nhầm sang bản ghi khác.
    const data = pickDefined(this.mapper.map(dto, UpdateWarehouseRequestDto, Warehouse));
    if (data.code !== undefined && data.code !== warehouse.code)
      await this.assertCodeIsFree(data.code);
    if (data.name !== undefined && data.name !== warehouse.name)
      await this.assertNameIsFree(data.name);

    Object.assign(warehouse, data);
    const updated = await this.warehouseRepository.save(warehouse);
    this.logger.log(`Warehouse updated: ${updated.id}`, context);
    return this.mapper.map(updated, Warehouse, WarehouseResponseDto);
  }

  async assignManager(
    slug: string,
    dto: AssignWarehouseManagerRequestDto,
  ): Promise<WarehouseResponseDto> {
    const context = `${WarehouseService.name}.${this.assignManager.name}`;
    const warehouse = await this.warehouseRepository.findOne({
      where: { slug },
      relations: WAREHOUSE_RELATIONS,
    });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);

    warehouse.manager =
      dto.managerSlug === null ? null : await this.resolveManager(dto.managerSlug);

    const updated = await this.warehouseRepository.save(warehouse);
    this.logger.log(
      `Warehouse ${updated.id} manager set to: ${updated.manager?.id ?? 'none'}`,
      context,
    );
    return this.mapper.map(updated, Warehouse, WarehouseResponseDto);
  }

  /**
   * Gán 1 user làm thành viên kho (`PUT`, idempotent): đã là thành viên thì trả row hiện có, không
   * ghi gì. Không đụng `Warehouse.manager` và không chặn chính manager —
   * quản lý vẫn là slot riêng trên `warehouse_tbl`.
   *
   * `UQ_warehouse_member` tính cả row đã xoá mềm (xem `warehouse-member.entity.ts`), nên user từng bị
   * gỡ khỏi kho được `recover()` lại row cũ thay vì `insert` row mới (sẽ dính `ER_DUP_ENTRY` → 500).
   */
  async assignMember(
    slug: string,
    dto: AssignWarehouseMemberRequestDto,
  ): Promise<WarehouseMemberResponseDto> {
    const context = `${WarehouseService.name}.${this.assignMember.name}`;
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);

    const user = await this.userService.findBySlug(dto.userSlug);
    if (!user) throw new WarehouseException(WarehouseValidation.WAREHOUSE_MEMBER_USER_NOT_FOUND);
    if (!user.isActive)
      throw new WarehouseException(WarehouseValidation.WAREHOUSE_MEMBER_USER_INACTIVE);

    const existed = await this.warehouseMemberRepository.findOne({
      where: { warehouse: { id: warehouse.id }, user: { id: user.id } },
      withDeleted: true,
    });
    let member: WarehouseMember;
    if (existed && !existed.deletedAt) member = existed;
    else if (existed) member = await this.warehouseMemberRepository.recover(existed);
    else
      member = await this.warehouseMemberRepository.save(
        this.warehouseMemberRepository.create({ warehouse, user }),
      );
    member.user = user;

    this.logger.log(`User ${user.id} assigned to warehouse ${warehouse.id}`, context);
    return this.mapper.map(member, WarehouseMember, WarehouseMemberResponseDto);
  }

  /**
   * User gán được vào kho qua `PUT :slug/members`: đang hoạt động (`assignMember` chặn user bị khoá),
   * chưa là thành viên (row xoá mềm — đã bị gỡ — vẫn tính là gán được), và không phải manager hiện
   * tại của kho (manager đã có slot riêng).
   */
  async findAvailableMembers(
    slug: string,
    query: GetAllUserRequestDto,
  ): Promise<AppPaginatedResponseDto<UserResponseDto>> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { slug },
      relations: { manager: true },
    });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);

    const members = await this.warehouseMemberRepository.find({
      where: { warehouse: { id: warehouse.id } },
      relations: { user: true },
    });
    const excludedIds = members.map((member) => member.user?.id).filter(Boolean);
    if (warehouse.manager) excludedIds.push(warehouse.manager.id);

    return this.userService.findAll(query, { excludedIds, onlyActive: true });
  }

  /**
   * Gỡ user khỏi kho = xoá mềm row thành viên; `assignMember` sau đó `recover()` lại đúng row này.
   * Không check `user.isActive`: user đã bị khoá vẫn phải gỡ được khỏi kho.
   */
  async removeMember(slug: string, userSlug: string): Promise<number> {
    const context = `${WarehouseService.name}.${this.removeMember.name}`;
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);

    const member = await this.warehouseMemberRepository.findOne({
      where: { warehouse: { id: warehouse.id }, user: { slug: userSlug } },
    });
    if (!member) throw new WarehouseException(WarehouseValidation.WAREHOUSE_MEMBER_NOT_FOUND);

    await this.warehouseMemberRepository.softRemove(member);
    this.logger.log(`Member ${member.id} removed from warehouse ${warehouse.id}`, context);
    return 1;
  }

  async deleteWarehouse(slug: string): Promise<number> {
    const context = `${WarehouseService.name}.${this.deleteWarehouse.name}`;
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    // Soft delete warehouse:
    if (warehouse.isActive)
      throw new WarehouseException(WarehouseValidation.WAREHOUSE_ACTIVE_CANNOT_BE_DELETED);

    await this.warehouseRepository.softRemove(warehouse);
    this.logger.log(`Warehouse deleted: ${warehouse.id}`, context);
    return 1;
  }

  private async paginate(
    where: FindOptionsWhere<Warehouse> | FindOptionsWhere<Warehouse>[],
    query: GetMyWarehouseRequestDto,
  ): Promise<AppPaginatedResponseDto<WarehouseResponseDto>> {
    const [items, total] = await this.warehouseRepository.findAndCount({
      where,
      relations: WAREHOUSE_RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, Warehouse, WarehouseResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<WarehouseResponseDto>;
  }

  /**
   * `code` check UNIQUE index DB nhưng index đó KHÔNG bỏ qua bản ghi xoá mềm — nên phải tra kèm
   * `withDeleted` và phân biệt 2 tình huống, thay vì để MySQL ném `ER_DUP_ENTRY` thành lỗi 500.
   */
  private async assertCodeIsFree(code: string): Promise<void> {
    const existed = await this.warehouseRepository.findOne({
      where: { code },
      withDeleted: true,
    });
    if (!existed) return;
    throw new WarehouseException(
      existed.deletedAt
        ? WarehouseValidation.WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE
        : WarehouseValidation.WAREHOUSE_CODE_DOES_EXIST,
    );
  }

  private async assertNameIsFree(name: string): Promise<void> {
    const existed = await this.warehouseRepository.findOneBy({ name });
    if (existed) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NAME_DOES_EXIST);
  }

  /**
   * `UserService.findBySlug` đã loại bản ghi xoá mềm và trả kèm `role` (quan hệ eager trên `User`),
   * nên cả 3 rào dưới đây chỉ tốn 1 query.
   */
  private async resolveManager(managerSlug: string) {
    const manager = await this.userService.findBySlug(managerSlug);
    if (!manager) throw new WarehouseException(WarehouseValidation.WAREHOUSE_MANAGER_NOT_FOUND);
    if (!manager.isActive)
      throw new WarehouseException(WarehouseValidation.WAREHOUSE_MANAGER_INACTIVE);
    // Ràng buộc toàn vẹn dữ liệu trên NGƯỜI ĐƯỢC GÁN (không phải phân quyền người gọi): chỉ role
    // MANAGER mới có sẵn IMPORT_FORM_CONFIRM/EXPORT_FORM_CONFIRM/BALANCE_FORM_APPROVE/
    // WAREHOUSE_PAYMENT_APPROVE (migration 1783728000012) của chính kho mình quản lý.
    if (manager.role?.name !== RoleEnum.Manager)
      throw new WarehouseException(WarehouseValidation.WAREHOUSE_MANAGER_ROLE_INVALID);
    return manager;
  }
}
