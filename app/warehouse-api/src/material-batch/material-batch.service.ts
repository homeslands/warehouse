import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager, Equal, FindOptionsWhere, LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  GetAllMaterialBatchRequestDto,
  MaterialBatchResponseDto,
  MaterialBatchSortBy,
} from './material-batch.dto';
import { MaterialBatch } from './material-batch.entity';
import { MaterialBatchStatus, statusOfRemaining } from './material-batch.constants';
import { MaterialBatchException } from './material-batch.exception';
import { MaterialBatchValidation } from './material-batch.validation';
import { ImportForm } from 'src/import-form/import-form.entity';
import { ImportFormItem } from 'src/import-form/import-form-item.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { Material } from 'src/material/material.entity';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { buildSortOrder } from 'src/shared/utils/query.util';

/** Quan hệ đủ để dựng response (không `eager`). */
const RELATIONS = {
  material: true,
  warehouse: true,
  importFormItem: { importForm: true },
} as const;

/** 1 dòng cần trừ lô. `key` do caller đặt (id dòng phiếu xuất) để ghép lại kết quả. */
export interface BatchConsumeLine {
  key: string;
  materialId: string;
  /** Lượng cần trừ, đơn vị cơ sở, > 0. */
  baseQuantity: number;
  /** Có ⇒ chỉ trừ đúng lô này; không ⇒ FEFO. */
  batchId?: string | null;
}

export interface BatchAllocation {
  batch: MaterialBatch;
  baseQuantity: number;
}

/**
 * FEFO (first-expired, first-out): hạn dùng sớm nhất trước, lô không có hạn dùng xếp cuối; cùng
 * hạn thì nhập trước xuất trước; cuối cùng `createdAt`/`id` để thứ tự luôn xác định.
 */
export const compareFefo = (a: MaterialBatch, b: MaterialBatch): number => {
  const aNoExpiry = a.expiryDate ? 0 : 1;
  const bNoExpiry = b.expiryDate ? 0 : 1;
  if (aNoExpiry !== bNoExpiry) return aNoExpiry - bNoExpiry;
  if (a.expiryDate && b.expiryDate && a.expiryDate !== b.expiryDate)
    return a.expiryDate < b.expiryDate ? -1 : 1;
  if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? -1 : 1;
  const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (aCreated !== bCreated) return aCreated - bCreated;
  return a.id.localeCompare(b.id);
};

/**
 * Lô hàng chỉ ĐỌC qua API. Ghi duy nhất qua 2 cửa, đều chạy trong transaction của caller:
 * - `createFromImportItems` — xác nhận phiếu nhập: 1 dòng phiếu ⇒ 1 lô.
 * - `consume` — xác nhận phiếu xuất: trừ lô (chỉ định hoặc FEFO).
 */
@Injectable()
export class MaterialBatchService {
  constructor(
    @InjectRepository(MaterialBatch)
    private readonly batchRepository: Repository<MaterialBatch>,
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async findAll(
    warehouseSlug: string,
    query: GetAllMaterialBatchRequestDto,
  ): Promise<AppPaginatedResponseDto<MaterialBatchResponseDto>> {
    // `SUPER_ADMIN`/`ADMIN` bypass `WarehouseScopeGuard` ⇒ kho sai phải báo 404, không trả rỗng.
    const warehouse = await this.findWarehouse(warehouseSlug);

    const where: FindOptionsWhere<MaterialBatch> = { warehouse: { id: warehouse.id } };
    if (query.materialSlug) where.material = { slug: query.materialSlug };
    if (query.status !== undefined) where.status = query.status;
    // `LessThan` loại luôn lô `expiryDate IS NULL` (so sánh với NULL không bao giờ đúng).
    if (query.expiryBefore) where.expiryDate = LessThan(query.expiryBefore);

    const [items, total] = await this.batchRepository.findAndCount({
      where,
      relations: RELATIONS,
      order: buildSortOrder<MaterialBatch, MaterialBatchSortBy>(query, {
        expiryDate: ['expiryDate'],
        entryDate: ['entryDate'],
      }),
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, MaterialBatch, MaterialBatchResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<MaterialBatchResponseDto>;
  }

  async findOne(warehouseSlug: string, slug: string): Promise<MaterialBatchResponseDto> {
    const batch = await this.batchRepository.findOne({
      where: { slug, warehouse: { slug: warehouseSlug } },
      relations: RELATIONS,
    });
    if (!batch) {
      await this.findWarehouse(warehouseSlug);
      throw new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_NOT_FOUND);
    }
    return this.mapper.map(batch, MaterialBatch, MaterialBatchResponseDto);
  }

  /**
   * Xác nhận phiếu nhập: mỗi dòng (đã lưu, có `id`) sinh 1 lô còn nguyên — ngày nhập = ngày phiếu,
   * hạn dùng = `expiryDate` của dòng, số lượng = `baseQuantity`.
   */
  async createFromImportItems(
    manager: EntityManager,
    form: ImportForm,
    items: ImportFormItem[],
  ): Promise<MaterialBatch[]> {
    if (!items.length) return [];
    const batches = manager.getRepository(MaterialBatch);
    const created = items.map((item) =>
      batches.create({
        material: { id: item.material.id } as Material,
        warehouse: { id: form.warehouse.id } as Warehouse,
        importFormItem: { id: item.id } as ImportFormItem,
        entryDate: form.date,
        expiryDate: item.expiryDate ?? null,
        quantity: item.baseQuantity,
        remainingQuantity: item.baseQuantity,
        status: statusOfRemaining(item.baseQuantity),
      }),
    );
    const saved = await batches.save(created);
    this.logger.log(
      `Created ${saved.length} batch(es) from import form ${form.id}`,
      `${MaterialBatchService.name}.${this.createFromImportItems.name}`,
    );
    return saved;
  }

  /**
   * Trừ lô cho phiếu xuất, trong transaction của caller. Trả map `key` → các phần đã lấy (theo thứ
   * tự lấy). Ném `MATERIAL_BATCH_INSUFFICIENT` nếu lô chỉ định / tổng các lô không đủ.
   *
   * - Khoá (`FOR UPDATE`) mọi lô còn hàng của từng vật tư trong kho, vật tư xử lý theo thứ tự `id`
   *   cố định để 2 phiếu xuất đồng thời không deadlock. Lọc bằng `Equal(id)` trên quan hệ để TypeORM
   *   so thẳng cột FK — `{ material: { id } }` sinh LEFT JOIN và MySQL khoá luôn dòng vật tư/kho.
   * - Dòng chỉ định lô được trừ TRƯỚC dòng FEFO: FEFO không được ăn mất lượng mà dòng khác đã
   *   chỉ định đích danh.
   */
  async consume(
    manager: EntityManager,
    warehouseId: string,
    lines: BatchConsumeLine[],
  ): Promise<Map<string, BatchAllocation[]>> {
    const result = new Map<string, BatchAllocation[]>();
    const byMaterial = new Map<string, BatchConsumeLine[]>();
    for (const line of lines) {
      const group = byMaterial.get(line.materialId) ?? [];
      group.push(line);
      byMaterial.set(line.materialId, group);
    }

    const repository = manager.getRepository(MaterialBatch);
    for (const materialId of [...byMaterial.keys()].sort()) {
      const group = byMaterial.get(materialId)!;
      const locked = await repository.find({
        where: {
          warehouse: Equal(warehouseId),
          material: Equal(materialId),
          status: MaterialBatchStatus.InStock,
        },
        lock: { mode: 'pessimistic_write' },
      });
      const ordered = [...locked].sort(compareFefo);
      const left = new Map(ordered.map((batch) => [batch.id, batch.remainingQuantity]));
      const take = (batch: MaterialBatch, quantity: number) =>
        left.set(batch.id, roundToScale(left.get(batch.id)! - quantity));

      for (const line of group.filter((l) => l.batchId)) {
        const batch = ordered.find(({ id }) => id === line.batchId);
        const quantity = roundToScale(line.baseQuantity);
        if (!batch || left.get(batch.id)! < quantity)
          throw new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT);
        take(batch, quantity);
        result.set(line.key, [{ batch, baseQuantity: quantity }]);
      }

      for (const line of group.filter((l) => !l.batchId)) {
        let need = roundToScale(line.baseQuantity);
        const allocations: BatchAllocation[] = [];
        for (const batch of ordered) {
          if (need <= 0) break;
          const available = left.get(batch.id)!;
          if (available <= 0) continue;
          const quantity = Math.min(available, need);
          take(batch, quantity);
          need = roundToScale(need - quantity);
          allocations.push({ batch, baseQuantity: quantity });
        }
        if (need > 0)
          throw new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT);
        result.set(line.key, allocations);
      }

      for (const batch of ordered) {
        const remainingQuantity = left.get(batch.id)!;
        if (remainingQuantity === batch.remainingQuantity) continue;
        const status = statusOfRemaining(remainingQuantity);
        await repository.update({ id: batch.id }, { remainingQuantity, status });
        batch.remainingQuantity = remainingQuantity;
        batch.status = status;
      }
    }
    return result;
  }

  private async findWarehouse(slug: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    return warehouse;
  }
}
