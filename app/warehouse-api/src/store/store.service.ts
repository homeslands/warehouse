import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindOptionsRelations, FindOptionsWhere, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AssignStoreWarehouseRequestDto,
  CreateStoreRequestDto,
  GetAllStoreRequestDto,
  StoreResponseDto,
  UpdateStoreRequestDto,
} from './store.dto';
import { Store } from './store.entity';
import { StoreException } from './store.exception';
import { StoreValidation } from './store.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { pickDefined } from 'src/shared/utils/obj.util';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';

/**
 * `warehouse` cố ý KHÔNG `eager` trên entity (xem `store.entity.ts`), nên mọi read path phải truyền
 * hằng này — thiếu nó thì response im lặng mất `warehouseSlug`, không có lỗi nào báo ra.
 */
const STORE_RELATIONS: FindOptionsRelations<Store> = { warehouse: true };

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store) private readonly storeRepository: Repository<Store>,
    // Chỉ cần tra kho theo slug + check `isActive` nên đăng ký Repository thay vì import
    // `WarehouseModule` (giống `WarehouseMaterialService`).
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
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

  async findAll(query: GetAllStoreRequestDto): Promise<AppPaginatedResponseDto<StoreResponseDto>> {
    const where: FindOptionsWhere<Store> = {};
    // `typeof === 'boolean'` chứ không `!== undefined`: giá trị lạ (`?isActive=notabool`) phải bị
    // coi là KHÔNG lọc, không được lọt xuống `where` rồi lọc ngược tập dữ liệu. `@IsBoolean` ở DTO
    // đã chặn từ tầng HTTP, đây là rào thứ hai cho lời gọi service trực tiếp.
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;

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
   */
  async assignWarehouse(
    slug: string,
    dto: AssignStoreWarehouseRequestDto,
  ): Promise<StoreResponseDto> {
    const context = `${StoreService.name}.${this.assignWarehouse.name}`;
    const store = await this.storeRepository.findOne({
      where: { slug },
      relations: STORE_RELATIONS,
    });
    if (!store) throw new StoreException(StoreValidation.STORE_NOT_FOUND);

    store.warehouse =
      dto.warehouseSlug === null ? null : await this.resolveWarehouse(dto.warehouseSlug, store.id);

    const updated = await this.storeRepository.save(store);
    this.logger.log(
      `Store ${updated.id} warehouse set to: ${updated.warehouse?.id ?? 'none'}`,
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
   * Quan hệ là 1-1: kho đã thuộc về cửa hàng khác thì không gắn lại được. UNIQUE index ở
   * `store_tbl.warehouse_id_column` là rào cuối ở DB, check này chỉ để trả lỗi nghiệp vụ thay vì
   * để MySQL ném `ER_DUP_ENTRY` thành 500.
   */
  private async resolveWarehouse(warehouseSlug: string, storeId: string): Promise<Warehouse> {
    // Kho đã xoá mềm bị `findOneBy` loại sẵn ⇒ rơi vào nhánh không tìm thấy, không cần mã lỗi riêng.
    const warehouse = await this.warehouseRepository.findOneBy({ slug: warehouseSlug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    if (!warehouse.isActive) throw new StoreException(StoreValidation.STORE_WAREHOUSE_INACTIVE);

    // `withDeleted`: cửa hàng đã xoá mềm VẪN giữ FK (UNIQUE index không bỏ qua row xoá mềm), nên
    // phải phân biệt "kho đang thuộc cửa hàng khác" với "kho bị cửa hàng đã xoá giữ chỗ".
    const holder = await this.storeRepository.findOne({
      where: { warehouse: { id: warehouse.id } },
      withDeleted: true,
    });
    if (holder && holder.id !== storeId)
      throw new StoreException(
        holder.deletedAt
          ? StoreValidation.STORE_WAREHOUSE_RESERVED_BY_DELETED_STORE
          : StoreValidation.STORE_WAREHOUSE_ALREADY_ASSIGNED,
      );

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
