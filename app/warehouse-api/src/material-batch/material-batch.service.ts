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
  material: { type: true, baseUnit: true },
  warehouse: true,
  importFormItem: { importForm: true },
} as const;

/** 1 dòng cần trừ lô. `key` do caller đặt (id dòng phiếu xuất) để ghép lại kết quả. */
export interface BatchConsumeLine {
  key: string;
  materialId: string;
  /** Lượng cần giữ/trừ/trả, đơn vị cơ sở, > 0. */
  baseQuantity: number;
  /** Có ⇒ chỉ đụng đúng lô này; không ⇒ FEFO (chỉ dùng cho `reserve`). */
  batchId?: string | null;
}

/** Thay đổi trên 1 lô, đơn vị cơ sở. */
interface BatchChange {
  remainingDelta?: number;
  reservedDelta?: number;
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
 * Lô hàng chỉ ĐỌC qua API. Ghi duy nhất qua các cửa sau, đều chạy trong transaction của caller:
 * - `createFromImportItems` — xác nhận phiếu nhập: 1 dòng phiếu ⇒ 1 lô.
 * - `reserve` — gửi duyệt phiếu xuất (`PENDING`): giữ chỗ trên lô (chỉ định hoặc FEFO).
 * - `consumeReserved` — xác nhận phiếu xuất: trừ đúng phần đã giữ.
 * - `release` — huỷ phiếu `PENDING`: trả lại phần đã giữ.
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
        reservedQuantity: 0,
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
   * Gửi duyệt phiếu xuất (`DRAFT` → `PENDING`): GIỮ CHỖ trên lô, trong transaction của caller. Trả
   * map `key` → các lô đã giữ (theo thứ tự lấy) để caller tách dòng. Chỉ lấy phần còn trống
   * `remainingQuantity - reservedQuantity`; thiếu ⇒ `MATERIAL_BATCH_INSUFFICIENT`.
   *
   * - Dòng chỉ định lô được giữ TRƯỚC dòng FEFO: FEFO không được ăn mất lượng mà dòng khác đã
   *   chỉ định đích danh.
   * - Dòng không chỉ định lô: FEFO, lô đã chọn được ghi lại trên dòng (caller tách dòng) — lúc xác
   *   nhận trừ đúng những lô đã giữ, không chọn lại.
   */
  async reserve(
    manager: EntityManager,
    warehouseId: string,
    lines: BatchConsumeLine[],
  ): Promise<Map<string, BatchAllocation[]>> {
    const result = new Map<string, BatchAllocation[]>();
    await this.forEachMaterial(manager, warehouseId, lines, async (group, ordered, write) => {
      const free = new Map(
        ordered.map((batch) => [
          batch.id,
          roundToScale(batch.remainingQuantity - batch.reservedQuantity),
        ]),
      );
      const take = (batch: MaterialBatch, quantity: number) => {
        free.set(batch.id, roundToScale(free.get(batch.id)! - quantity));
        write(batch, { reservedDelta: quantity });
      };

      for (const line of group.filter((l) => l.batchId)) {
        const batch = ordered.find(({ id }) => id === line.batchId);
        const quantity = roundToScale(line.baseQuantity);
        if (!batch || free.get(batch.id)! < quantity)
          throw new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_INSUFFICIENT);
        take(batch, quantity);
        result.set(line.key, [{ batch, baseQuantity: quantity }]);
      }

      for (const line of group.filter((l) => !l.batchId)) {
        let need = roundToScale(line.baseQuantity);
        const allocations: BatchAllocation[] = [];
        for (const batch of ordered) {
          if (need <= 0) break;
          const available = free.get(batch.id)!;
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
    });
    return result;
  }

  /**
   * Xác nhận phiếu `PENDING`: trừ `remainingQuantity` VÀ `reservedQuantity` của đúng lô đã giữ lúc
   * gửi duyệt. Mỗi dòng phải có `batchId` (gửi duyệt đã tách dòng theo lô).
   */
  async consumeReserved(
    manager: EntityManager,
    warehouseId: string,
    lines: BatchConsumeLine[],
  ): Promise<void> {
    await this.applyToReserved(manager, warehouseId, lines, (quantity) => ({
      remainingDelta: -quantity,
      reservedDelta: -quantity,
    }));
  }

  /** Huỷ phiếu `PENDING`: trả lại phần đã giữ trên từng lô (`reservedQuantity` giảm). */
  async release(
    manager: EntityManager,
    warehouseId: string,
    lines: BatchConsumeLine[],
  ): Promise<void> {
    await this.applyToReserved(manager, warehouseId, lines, (quantity) => ({
      reservedDelta: -quantity,
    }));
  }

  private async applyToReserved(
    manager: EntityManager,
    warehouseId: string,
    lines: BatchConsumeLine[],
    toChange: (quantity: number) => BatchChange,
  ): Promise<void> {
    await this.forEachMaterial(manager, warehouseId, lines, async (group, ordered, write) => {
      for (const line of group) {
        const batch = ordered.find(({ id }) => id === line.batchId);
        if (!batch)
          throw new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_RESERVED_INVALID);
        write(batch, toChange(roundToScale(line.baseQuantity)));
      }
    });
  }

  /**
   * Khung chung của mọi thay đổi lô từ phiếu xuất, trong transaction của caller:
   *
   * - Khoá (`FOR UPDATE`) mọi lô còn hàng của từng vật tư trong kho, vật tư xử lý theo thứ tự `id`
   *   cố định — CẢ 3 luồng (giữ chỗ / xác nhận / huỷ) khoá cùng 1 kiểu nên không deadlock lẫn nhau.
   *   Lô đang được giữ chỗ luôn còn hàng (`remaining >= reserved > 0`) nên nằm trong tập đã khoá.
   *   Lọc bằng `Equal(id)` trên quan hệ để TypeORM so thẳng cột FK — `{ material: { id } }` sinh
   *   LEFT JOIN và MySQL khoá luôn dòng vật tư/kho.
   * - `handle` gom thay đổi qua `write`; cuối cùng kiểm bất biến
   *   `0 <= reserved <= remaining` rồi ghi các lô có đổi, `status` theo `remaining`.
   */
  private async forEachMaterial(
    manager: EntityManager,
    warehouseId: string,
    lines: BatchConsumeLine[],
    handle: (
      group: BatchConsumeLine[],
      ordered: MaterialBatch[],
      write: (batch: MaterialBatch, change: BatchChange) => void,
    ) => Promise<void>,
  ): Promise<void> {
    const byMaterial = new Map<string, BatchConsumeLine[]>();
    for (const line of lines) {
      const group = byMaterial.get(line.materialId) ?? [];
      group.push(line);
      byMaterial.set(line.materialId, group);
    }

    const repository = manager.getRepository(MaterialBatch);
    for (const materialId of [...byMaterial.keys()].sort()) {
      const locked = await repository.find({
        where: {
          warehouse: Equal(warehouseId),
          material: Equal(materialId),
          status: MaterialBatchStatus.InStock,
        },
        lock: { mode: 'pessimistic_write' },
      });
      const ordered = [...locked].sort(compareFefo);
      const next = new Map(
        ordered.map((batch) => [
          batch.id,
          { remaining: batch.remainingQuantity, reserved: batch.reservedQuantity },
        ]),
      );
      await handle(byMaterial.get(materialId)!, ordered, (batch, change) => {
        const value = next.get(batch.id)!;
        value.remaining = roundToScale(value.remaining + (change.remainingDelta ?? 0));
        value.reserved = roundToScale(value.reserved + (change.reservedDelta ?? 0));
      });

      for (const batch of ordered) {
        const { remaining, reserved } = next.get(batch.id)!;
        if (remaining === batch.remainingQuantity && reserved === batch.reservedQuantity) continue;
        if (reserved < 0 || remaining < reserved)
          throw new MaterialBatchException(MaterialBatchValidation.MATERIAL_BATCH_RESERVED_INVALID);
        const status = statusOfRemaining(remaining);
        await repository.update(
          { id: batch.id },
          { remainingQuantity: remaining, reservedQuantity: reserved, status },
        );
        batch.remainingQuantity = remaining;
        batch.reservedQuantity = reserved;
        batch.status = status;
      }
    }
  }

  private async findWarehouse(slug: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    return warehouse;
  }
}
