import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AdjustWarehouseMaterialQuantityRequestDto,
  AssignWarehouseMaterialRequestDto,
  GetWarehouseMaterialRequestDto,
  UpdateWarehouseMaterialRequestDto,
  WarehouseMaterialResponseDto,
} from './warehouse-material.dto';
import { WarehouseMaterial } from './warehouse-material.entity';
import { WarehouseMaterialException } from './warehouse-material.exception';
import { WarehouseMaterialValidation } from './warehouse-material.validation';
import { effectiveMaximum, effectiveMinimum } from './warehouse-material.util';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { MaterialService } from 'src/material/material.service';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';

/**
 * `quantity` không bao giờ được tính bằng đọc-rồi-ghi, nên mọi read path chỉ cần đủ quan hệ để
 * dựng response: `warehouse`, `material` và `material.type` (cả 3 đều không `eager`).
 */
const RELATIONS = { warehouse: true, material: { type: true } } as const;

@Injectable()
export class WarehouseMaterialService {
  constructor(
    @InjectRepository(WarehouseMaterial)
    private readonly warehouseMaterialRepository: Repository<WarehouseMaterial>,
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly materialService: MaterialService,
  ) {}

  async assignMaterial(
    warehouseSlug: string,
    dto: AssignWarehouseMaterialRequestDto,
  ): Promise<WarehouseMaterialResponseDto> {
    const context = `${WarehouseMaterialService.name}.${this.assignMaterial.name}`;
    const warehouse = await this.findWarehouse(warehouseSlug);
    if (!warehouse.isActive)
      throw new WarehouseMaterialException(
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_WAREHOUSE_INACTIVE,
      );

    const material = await this.materialService.findEntityBySlug(dto.materialSlug);

    // UNIQUE(warehouse, material) không bỏ qua row xoá mềm, nên phải tự tra kèm `withDeleted` thay
    // vì để MySQL ném `ER_DUP_ENTRY` thành 500.
    const existed = await this.warehouseMaterialRepository.findOne({
      where: { warehouse: { id: warehouse.id }, material: { id: material.id } },
      withDeleted: true,
    });
    if (existed)
      throw new WarehouseMaterialException(
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_DOES_EXIST,
      );

    const row = this.warehouseMaterialRepository.create({
      warehouse,
      material,
      quantity: dto.quantity ?? 0,
      minimumInventory: dto.minimumInventory ?? null,
      maximumInventory: dto.maximumInventory ?? null,
    });
    this.assertEffectiveRange(row);

    const created = await this.warehouseMaterialRepository.save(row);
    this.logger.log(
      `Material ${material.id} assigned to warehouse ${warehouse.id}: ${created.id}`,
      context,
    );
    return this.toResponse(created);
  }

  async findAll(
    warehouseSlug: string,
    query: GetWarehouseMaterialRequestDto,
  ): Promise<AppPaginatedResponseDto<WarehouseMaterialResponseDto>> {
    const warehouse = await this.findWarehouse(warehouseSlug);

    // QueryBuilder chứ không `findAndCount`: 2 filter `belowMinimum`/`aboveMaximum` so với ngưỡng
    // EFFECTIVE (`COALESCE(override, mặc định của material)`), không diễn đạt được bằng
    // `FindOptionsWhere`. Lọc ở SQL để phân trang vẫn đúng tổng số.
    const qb = this.warehouseMaterialRepository
      .createQueryBuilder('wm')
      .innerJoinAndSelect('wm.material', 'material')
      .innerJoinAndSelect('material.type', 'type')
      .innerJoinAndSelect('wm.warehouse', 'warehouse')
      .where('warehouse.id_column = :warehouseId', { warehouseId: warehouse.id });

    if (query.typeSlug) qb.andWhere('type.slug_column = :typeSlug', { typeSlug: query.typeSlug });
    if (query.belowMinimum === true)
      qb.andWhere(
        'wm.quantity_column < COALESCE(wm.minimum_inventory_column, material.minimum_inventory_column)',
      );
    if (query.aboveMaximum === true)
      qb.andWhere(
        'wm.quantity_column > COALESCE(wm.maximum_inventory_column, material.maximum_inventory_column)',
      );

    const [items, total] = await qb
      .orderBy('wm.created_at_column', 'DESC')
      .skip((query.page - 1) * query.size)
      .take(query.size)
      .getManyAndCount();

    const totalPages = Math.ceil(total / query.size);
    return {
      items: this.mapper.mapArray(items, WarehouseMaterial, WarehouseMaterialResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<WarehouseMaterialResponseDto>;
  }

  async updateThresholds(
    warehouseSlug: string,
    materialSlug: string,
    dto: UpdateWarehouseMaterialRequestDto,
  ): Promise<WarehouseMaterialResponseDto> {
    const context = `${WarehouseMaterialService.name}.${this.updateThresholds.name}`;
    const row = await this.findRow(warehouseSlug, materialSlug);

    // `undefined` = client không gửi field (giữ nguyên); `null` = gửi null (bỏ override). Phân biệt
    // 2 cái này bằng `in`/`!== undefined`, đừng dùng `??` — nó nuốt mất ý nghĩa của `null`.
    if (dto.minimumInventory !== undefined) row.minimumInventory = dto.minimumInventory;
    if (dto.maximumInventory !== undefined) row.maximumInventory = dto.maximumInventory;
    this.assertEffectiveRange(row);

    const updated = await this.warehouseMaterialRepository.save(row);
    this.logger.log(`Warehouse material thresholds updated: ${updated.id}`, context);
    return this.toResponse(updated);
  }

  async adjustQuantity(
    warehouseSlug: string,
    materialSlug: string,
    dto: AdjustWarehouseMaterialQuantityRequestDto,
  ): Promise<WarehouseMaterialResponseDto> {
    const context = `${WarehouseMaterialService.name}.${this.adjustQuantity.name}`;
    // `@IsNotEmpty()` của class-validator KHÔNG chặn số 0 (0 không phải "empty"), nên phải chặn ở đây.
    const delta = Math.trunc(Number(dto.delta));
    if (!Number.isFinite(delta) || delta === 0)
      throw new WarehouseMaterialException(
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_DELTA_INVALID,
      );

    const row = await this.findRow(warehouseSlug, materialSlug);

    // 1 câu UPDATE có điều kiện, KHÔNG đọc-rồi-ghi: 2 lần điều chỉnh đồng thời đều được cộng dồn
    // thay vì mất 1. `delta` đã qua `Math.trunc(Number(...))` nên nội suy vào SQL là số, không phải
    // chuỗi từ client. `affected === 0` nghĩa là điều kiện `>= 0` chặn lại.
    const result = await this.warehouseMaterialRepository
      .createQueryBuilder()
      .update(WarehouseMaterial)
      .set({ quantity: () => `quantity_column + (${delta})` })
      .where('id_column = :id', { id: row.id })
      .andWhere(`quantity_column + (${delta}) >= 0`)
      .execute();

    if (!result.affected)
      throw new WarehouseMaterialException(
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_QUANTITY_NEGATIVE,
      );

    this.logger.log(`Warehouse material ${row.id} quantity adjusted by ${delta}`, context);
    return this.toResponse(await this.findRow(warehouseSlug, materialSlug));
  }

  async removeMaterial(warehouseSlug: string, materialSlug: string): Promise<number> {
    const context = `${WarehouseMaterialService.name}.${this.removeMaterial.name}`;
    const row = await this.findRow(warehouseSlug, materialSlug);

    // Gỡ khi còn tồn là mất dấu số lượng đang nằm trong kho — bắt xuất hết trước, cùng tinh thần
    // "không xoá kho đang isActive" của module warehouse.
    if (row.quantity > 0)
      throw new WarehouseMaterialException(
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_QUANTITY_NOT_EMPTY,
      );

    await this.warehouseMaterialRepository.softRemove(row);
    this.logger.log(`Warehouse material removed: ${row.id}`, context);
    return 1;
  }

  private async findWarehouse(slug: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    return warehouse;
  }

  private async findRow(warehouseSlug: string, materialSlug: string): Promise<WarehouseMaterial> {
    const row = await this.warehouseMaterialRepository.findOne({
      where: { warehouse: { slug: warehouseSlug }, material: { slug: materialSlug } },
      relations: RELATIONS,
    });
    // Kho không tồn tại cũng rơi vào đây; tách ra để client phân biệt được 2 tình huống.
    if (!row) {
      await this.findWarehouse(warehouseSlug);
      throw new WarehouseMaterialException(
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_NOT_FOUND,
      );
    }
    return row;
  }

  /**
   * So bằng ngưỡng EFFECTIVE, không so 2 giá trị override với nhau: override 1 vế mà vế kia lấy của
   * `Material` vẫn phải ra một khoảng hợp lệ, nếu không client dựng được cặp ngưỡng mâu thuẫn
   * (min 50 override, max 10 của material) mà không endpoint nào báo lỗi.
   */
  private assertEffectiveRange(row: WarehouseMaterial): void {
    if (effectiveMaximum(row) < effectiveMinimum(row))
      throw new WarehouseMaterialException(
        WarehouseMaterialValidation.WAREHOUSE_MATERIAL_INVENTORY_RANGE_INVALID,
      );
  }

  private toResponse(row: WarehouseMaterial): WarehouseMaterialResponseDto {
    return this.mapper.map(row, WarehouseMaterial, WarehouseMaterialResponseDto);
  }
}
