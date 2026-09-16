import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindOptionsWhere, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreateStoreRequestDto,
  GetAllStoreRequestDto,
  StoreResponseDto,
  UpdateStoreRequestDto,
} from './store.dto';
import { Store } from './store.entity';
import { StoreException } from './store.exception';
import { StoreValidation } from './store.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Store) private readonly storeRepository: Repository<Store>,
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
    const store = await this.storeRepository.findOneBy({ slug });
    if (!store) throw new StoreException(StoreValidation.STORE_NOT_FOUND);
    return this.mapper.map(store, Store, StoreResponseDto);
  }

  async updateStore(slug: string, dto: UpdateStoreRequestDto): Promise<StoreResponseDto> {
    const context = `${StoreService.name}.${this.updateStore.name}`;
    // `lock.optimistic` để TypeORM tự ném `OptimisticLockVersionMismatchError` khi `version` lệch —
    // `OptimisticLockExceptionFilter` (global) đổi nó thành `DATA_VERSION_CONFLICT` 409, không
    // try/catch ở đây.
    const store = await this.storeRepository.findOne({
      where: { slug },
      lock: { mode: 'optimistic', version: dto.version },
    });
    if (!store) throw new StoreException(StoreValidation.STORE_NOT_FOUND);

    const data = this.mapper.map(dto, UpdateStoreRequestDto, Store);
    // Chỉ check lại trùng khi giá trị THỰC SỰ đổi — gửi lại đúng giá trị cũ không được báo trùng
    // với chính bản ghi đang sửa.
    if (data.code !== store.code) await this.assertCodeIsFree(data.code);
    if (data.name !== store.name) await this.assertNameIsFree(data.name);
    if (data.taxCode !== store.taxCode) await this.assertTaxCodeIsFree(data.taxCode);

    Object.assign(store, data);
    const updated = await this.storeRepository.save(store);
    this.logger.log(`Store updated: ${updated.id}`, context);
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
