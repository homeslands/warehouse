import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager, FindOptionsRelations, FindOptionsWhere, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AssignStoreWarehouseRequestDto,
  CreateStoreRequestDto,
  GetAllStoreRequestDto,
  GetStoreWarehouseHistoryRequestDto,
  StoreResponseDto,
  StoreWarehouseHistoryResponseDto,
  UpdateStoreRequestDto,
} from './store.dto';
import { Store } from './store.entity';
import { StoreWarehouseHistory } from './store-warehouse-history.entity';
import { StoreWarehouseHistoryAction } from './store.constants';
import { StoreException } from './store.exception';
import { StoreValidation } from './store.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { pickDefined } from 'src/shared/utils/obj.util';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { CurrentUserDto } from 'src/user/user.decorator';
import { hasRole } from 'src/role/role.decorator';
import { WAREHOUSE_SCOPED_ROLES } from 'src/warehouse/warehouse.constants';
import { User } from 'src/user/user.entity';

/**
 * `warehouse` cố ý KHÔNG `eager` trên entity (xem `store.entity.ts`), nên mọi read path phải truyền
 * hằng này — thiếu nó thì response im lặng mất `warehouseSlug`/`manager`, không có lỗi nào báo ra.
 * Store không có cột quản lý riêng: `manager` của cửa hàng chính là `warehouse.manager`.
 */
const STORE_RELATIONS: FindOptionsRelations<Store> = { warehouse: { manager: true } };

/**
 * Bản rút gọn cho `SELECT ... FOR UPDATE` trong `applyWarehouse` — không join `manager` để khỏi khoá
 * luôn dòng `user_tbl`. `manager` của kho đích lấy qua `resolveWarehouse` thay vào đó.
 */
const STORE_LOCK_RELATIONS: FindOptionsRelations<Store> = { warehouse: true };

const HISTORY_RELATIONS: FindOptionsRelations<StoreWarehouseHistory> = {
  previousWarehouse: true,
  newWarehouse: true,
  relatedStore: true,
  restoredFrom: true,
  changedBy: true,
};

/**
 * Khoá dòng cửa hàng trong transaction gắn kho: 2 request cùng lúc tranh 1 kho (hoặc cùng sửa 1 cửa
 * hàng) phải chạy nối tiếp, nếu không cả 2 cùng thấy kho "rảnh" và bên sau ăn `ER_DUP_ENTRY` của
 * `UQ_store_warehouse` thành 500, hoặc lịch sử ghi sai `previousWarehouse`.
 */
const WRITE_LOCK = { mode: 'pessimistic_write' } as const;

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store) private readonly storeRepository: Repository<Store>,
    @InjectRepository(StoreWarehouseHistory)
    private readonly historyRepository: Repository<StoreWarehouseHistory>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly transactionManager: TransactionManagerService,
  ) {}

  async createStore(dto: CreateStoreRequestDto): Promise<StoreResponseDto> {
    const context = `${StoreService.name}.${this.createStore.name}`;
    const data = this.mapper.map(dto, CreateStoreRequestDto, Store);

    await this.assertCodeIsFree(data.code);
    await this.assertNameIsFree(data.name);
    await this.assertTaxCodeIsFree(data.taxCode);

    const created = await this.storeRepository.save(this.storeRepository.create(data));
    this.logger.log(`Store created: ${created.id}`, context);
    return this.mapper.map(created, Store, StoreResponseDto);
  }

  /**
   * `MANAGER`/`SUPERVISOR` chỉ thấy cửa hàng gắn với kho mà user đó là manager HOẶC thành viên
   * (`Store` không có cột người quản lý riêng, quyền đi qua kho — cùng phạm vi với `GET /warehouses`).
   * Cửa hàng chưa gắn kho vì vậy không hiện với họ. `ADMIN`/`SUPER_ADMIN` thấy toàn bộ.
   */
  async findAll(
    query: GetAllStoreRequestDto,
    currentUser?: CurrentUserDto,
  ): Promise<AppPaginatedResponseDto<StoreResponseDto>> {
    const base: FindOptionsWhere<Store> = {};
    // `typeof === 'boolean'` chứ không `!== undefined`: giá trị lạ (`?isActive=notabool`) phải bị
    // coi là KHÔNG lọc, không được lọt xuống `where` rồi lọc ngược tập dữ liệu. `@IsBoolean` ở DTO
    // đã chặn từ tầng HTTP, đây là rào thứ hai cho lời gọi service trực tiếp.
    if (typeof query.isActive === 'boolean') base.isActive = query.isActive;

    // Mảng `where` = OR; member đã gỡ (xoá mềm) tự bị loại vì TypeORM thêm `deleted_at IS NULL` vào join.
    const where: FindOptionsWhere<Store> | FindOptionsWhere<Store>[] = hasRole(
      currentUser,
      ...WAREHOUSE_SCOPED_ROLES,
    )
      ? [
          { ...base, warehouse: { manager: { id: currentUser.userId } } },
          { ...base, warehouse: { members: { user: { id: currentUser.userId } } } },
        ]
      : base;

    const [items, total] = await this.storeRepository.findAndCount({
      where,
      relations: STORE_RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, Store, StoreResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<StoreResponseDto>;
  }

  async findOne(slug: string): Promise<StoreResponseDto> {
    const store = await this.storeRepository.findOne({
      where: { slug },
      relations: STORE_RELATIONS,
    });
    if (!store) throw new StoreException(StoreValidation.STORE_NOT_FOUND);
    return this.mapper.map(store, Store, StoreResponseDto);
  }

  async updateStore(slug: string, dto: UpdateStoreRequestDto): Promise<StoreResponseDto> {
    const context = `${StoreService.name}.${this.updateStore.name}`;
    const store = await this.storeRepository.findOne({
      where: { slug },
      relations: STORE_RELATIONS,
    });
    if (!store) throw new StoreException(StoreValidation.STORE_NOT_FOUND);

    // PATCH partial: `pickDefined` bỏ mọi field client không gửi, phần còn lại mới được ghi đè lên
    // entity vừa load ⇒ field vắng mặt giữ nguyên giá trị cũ.
    const data = pickDefined(this.mapper.map(dto, UpdateStoreRequestDto, Store));
    // Chỉ check lại trùng khi field CÓ được gửi VÀ giá trị THỰC SỰ đổi — gửi lại đúng giá trị cũ
    // không được báo trùng với chính bản ghi đang sửa, còn field không gửi thì không có gì để check
    // (thiếu rào `undefined` thì `assertCodeIsFree(undefined)` sẽ tra nhầm sang bản ghi khác).
    if (data.code !== undefined && data.code !== store.code) await this.assertCodeIsFree(data.code);
    if (data.name !== undefined && data.name !== store.name) await this.assertNameIsFree(data.name);
    if (data.taxCode !== undefined && data.taxCode !== store.taxCode)
      await this.assertTaxCodeIsFree(data.taxCode);

    Object.assign(store, data);
    const updated = await this.storeRepository.save(store);
    this.logger.log(`Store updated: ${updated.id}`, context);
    return this.mapper.map(updated, Store, StoreResponseDto);
  }

  /**
   * Gắn (hoặc gỡ với `warehouseSlug: null`) kho của cửa hàng. Tách khỏi `PATCH /stores/:slug` vì nó
   * thay thế đúng 1 slot và idempotent — cùng tinh thần `PUT /warehouses/:slug/manager`.
   *
   * Kho đang thuộc cửa hàng khác (kể cả cửa hàng đã xoá mềm) KHÔNG bị từ chối nữa: nó được gỡ khỏi
   * cửa hàng đó trước rồi mới gắn vào đây. Mọi thay đổi đều ghi `StoreWarehouseHistory`.
   */
  async assignWarehouse(
    actor: CurrentUserDto,
    slug: string,
    dto: AssignStoreWarehouseRequestDto,
  ): Promise<StoreResponseDto> {
    const context = `${StoreService.name}.${this.assignWarehouse.name}`;
    const updated = await this.transactionManager.execute((manager) =>
      this.applyWarehouse(manager, actor, slug, dto.warehouseSlug, {
        action: dto.warehouseSlug === null ? StoreWarehouseHistoryAction.Unassign : undefined,
      }),
    );
    this.logger.log(
      `Store ${updated.id} warehouse set to: ${updated.warehouse?.id ?? 'none'}`,
      context,
    );
    return this.mapper.map(updated, Store, StoreResponseDto);
  }

  async findWarehouseHistories(
    slug: string,
    query: GetStoreWarehouseHistoryRequestDto,
  ): Promise<AppPaginatedResponseDto<StoreWarehouseHistoryResponseDto>> {
    const store = await this.storeRepository.findOneBy({ slug });
    if (!store) throw new StoreException(StoreValidation.STORE_NOT_FOUND);

    const [items, total] = await this.historyRepository.findAndCount({
      where: { store: { id: store.id } },
      relations: HISTORY_RELATIONS,
      // Kho/cửa hàng/dòng lịch sử liên quan bị xoá mềm sau đó vẫn phải hiện trong lịch sử.
      withDeleted: true,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, StoreWarehouseHistory, StoreWarehouseHistoryResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<StoreWarehouseHistoryResponseDto>;
  }

  /**
   * Đưa cửa hàng về `previousWarehouse` của 1 dòng lịch sử (null ⇒ gỡ kho). Đi qua đúng luồng
   * `applyWarehouse` nên cùng rào (kho phải còn và đang `isActive`), cùng hành vi lấy kho từ cửa hàng
   * khác, và bản thân lần restore cũng được ghi lịch sử (`RESTORE`) ⇒ restore cũng hoàn tác được.
   */
  async restoreWarehouse(
    actor: CurrentUserDto,
    slug: string,
    historySlug: string,
  ): Promise<StoreResponseDto> {
    const context = `${StoreService.name}.${this.restoreWarehouse.name}`;
    const updated = await this.transactionManager.execute(async (manager) => {
      const entry = await manager.getRepository(StoreWarehouseHistory).findOne({
        where: { slug: historySlug, store: { slug } },
        relations: { previousWarehouse: true },
        // Kho cũ đã xoá mềm vẫn phải nạp ra được: nếu không `previousWarehouse` thành `null` và
        // restore hiểu nhầm là "gỡ kho" thay vì báo `WAREHOUSE_NOT_FOUND`.
        withDeleted: true,
      });
      if (!entry) throw new StoreException(StoreValidation.STORE_WAREHOUSE_HISTORY_NOT_FOUND);

      return this.applyWarehouse(manager, actor, slug, entry.previousWarehouse?.slug ?? null, {
        action: StoreWarehouseHistoryAction.Restore,
        restoredFrom: entry,
      });
    });
    this.logger.log(
      `Store ${updated.id} warehouse restored from history ${historySlug}: ${updated.warehouse?.id ?? 'none'}`,
      context,
    );
    return this.mapper.map(updated, Store, StoreResponseDto);
  }

  async deleteStore(slug: string): Promise<number> {
    const context = `${StoreService.name}.${this.deleteStore.name}`;
    const store = await this.storeRepository.findOneBy({ slug });
    if (!store) throw new StoreException(StoreValidation.STORE_NOT_FOUND);
    // Rào chống xoá nhầm: chưa có bảng sản phẩm/hoá đơn để check tham chiếu, nên bắt deactivate
    // trước khi xoá (giống `warehouse`).
    if (store.isActive) throw new StoreException(StoreValidation.STORE_ACTIVE_CANNOT_BE_DELETED);

    await this.storeRepository.softRemove(store);
    this.logger.log(`Store deleted: ${store.id}`, context);
    return 1;
  }

  /**
   * Lõi chung của gắn / gỡ / restore, chạy trong transaction của caller. Thứ tự ghi là bắt buộc vì
   * `UQ_store_warehouse`: gỡ kho khỏi cửa hàng đang giữ TRƯỚC, rồi mới trỏ cửa hàng này vào kho. Kho
   * cũ của cửa hàng này tự được nhả khi FK của nó đổi — không cần ghi gì thêm (không có cột phía kho).
   */
  private async applyWarehouse(
    manager: EntityManager,
    actor: CurrentUserDto,
    slug: string,
    warehouseSlug: string | null,
    options: { action?: StoreWarehouseHistoryAction; restoredFrom?: StoreWarehouseHistory },
  ): Promise<Store> {
    const stores = manager.getRepository(Store);
    const histories = manager.getRepository(StoreWarehouseHistory);
    const changedBy = { id: actor.userId } as User;

    const store = await stores.findOne({
      where: { slug },
      relations: STORE_LOCK_RELATIONS,
      lock: WRITE_LOCK,
    });
    if (!store) throw new StoreException(StoreValidation.STORE_NOT_FOUND);

    const target =
      warehouseSlug === null
        ? null
        : // Tra kho qua `manager` (không import `WarehouseModule`, giống `WarehouseMaterialService`).
          await this.resolveWarehouse(manager.getRepository(Warehouse), warehouseSlug);
    const previous = store.warehouse ?? null;
    // Gán `target` (đã kèm `manager`) cho cả nhánh idempotent: bản khoá ở trên không join `manager`.
    store.warehouse = target;
    // Idempotent: không đổi gì thì không ghi DB và không đẻ dòng lịch sử rác.
    if ((previous?.id ?? null) === (target?.id ?? null)) return store;

    let releasedFrom: Store | null = null;
    if (target) {
      // `withDeleted`: cửa hàng đã xoá mềm VẪN giữ FK (UNIQUE index không bỏ qua row xoá mềm).
      const holder = await stores.findOne({
        where: { warehouse: { id: target.id } },
        withDeleted: true,
        lock: WRITE_LOCK,
      });
      if (holder && holder.id !== store.id) {
        await stores.update({ id: holder.id }, { warehouse: null });
        await histories.save(
          histories.create({
            store: holder,
            action: StoreWarehouseHistoryAction.Released,
            previousWarehouse: target,
            newWarehouse: null,
            relatedStore: store,
            changedBy,
          }),
        );
        releasedFrom = holder;
      }
    }

    await stores.update({ id: store.id }, { warehouse: target });
    await histories.save(
      histories.create({
        store,
        action: options.action ?? StoreWarehouseHistoryAction.Assign,
        previousWarehouse: previous,
        newWarehouse: target,
        relatedStore: releasedFrom,
        restoredFrom: options.restoredFrom ?? null,
        changedBy,
      }),
    );

    return store;
  }

  private async resolveWarehouse(
    warehouses: Repository<Warehouse>,
    warehouseSlug: string,
  ): Promise<Warehouse> {
    // Kho đã xoá mềm bị `findOneBy` loại sẵn ⇒ rơi vào nhánh không tìm thấy, không cần mã lỗi riêng.
    const warehouse = await warehouses.findOne({
      where: { slug: warehouseSlug },
      relations: { manager: true },
    });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    if (!warehouse.isActive) throw new StoreException(StoreValidation.STORE_WAREHOUSE_INACTIVE);
    return warehouse;
  }

  /**
   * `code` có UNIQUE index ở DB nhưng index đó KHÔNG bỏ qua bản ghi xoá mềm — nên phải tra kèm
   * `withDeleted` và phân biệt 2 tình huống, thay vì để MySQL ném `ER_DUP_ENTRY` thành lỗi 500.
   */
  private async assertCodeIsFree(code: string): Promise<void> {
    const existed = await this.storeRepository.findOne({ where: { code }, withDeleted: true });
    if (!existed) return;
    throw new StoreException(
      existed.deletedAt
        ? StoreValidation.STORE_CODE_RESERVED_BY_DELETED_STORE
        : StoreValidation.STORE_CODE_DOES_EXIST,
    );
  }

  private async assertNameIsFree(name: string): Promise<void> {
    const existed = await this.storeRepository.findOneBy({ name });
    if (existed) throw new StoreException(StoreValidation.STORE_NAME_DOES_EXIST);
  }

  /**
   * Chỉ unique giữa các bản ghi CHƯA xoá mềm (không `withDeleted`, khác `assertCodeIsFree`): không
   * có UNIQUE index DB trên cột này, nên bản ghi đã xoá không giữ chỗ và không cần mã lỗi riêng.
   */
  private async assertTaxCodeIsFree(taxCode: string): Promise<void> {
    const existed = await this.storeRepository.findOneBy({ taxCode });
    if (existed) throw new StoreException(StoreValidation.STORE_TAX_CODE_DOES_EXIST);
  }
}
