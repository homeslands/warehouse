import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager, Equal, FindOptionsWhere, In, LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { GetAllItemRequestDto, ItemResponseDto, ItemSortBy } from './item.dto';
import { Item } from './item.entity';
import { ITEM_ON_HAND_STATUSES, ItemStatus, statusOfItem } from './item.constants';
import { ExportFormType } from 'src/export-form/export-form.constants';
import { ItemException } from './item.exception';
import { ItemValidation } from './item.validation';
import { ImportForm } from 'src/import-form/import-form.entity';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { findWarehouse } from 'src/warehouse/warehouse.util';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { buildSortOrder } from 'src/shared/utils/query.util';
import { toPaginatedResponse } from 'src/shared/utils/pagination.util';

/** Quan hệ đủ để dựng response (không `eager`). */
const RELATIONS = {
  material: { type: true, baseUnit: true },
  unit: true,
  warehouse: true,
  importForm: true,
} as const;

/** 1 dòng cần trừ item. `key` do caller đặt (id dòng phiếu xuất) để ghép lại kết quả. */
export interface ItemConsumeLine {
  key: string;
  materialId: string;
  /** Lượng cần giữ/trừ/trả, đơn vị cơ sở, > 0. */
  baseQuantity: number;
  /** Có ⇒ chỉ đụng đúng item này; không ⇒ FEFO (chỉ dùng cho `reserve`). */
  itemId?: string | null;
}

/** Thay đổi trên 1 item, đơn vị cơ sở. */
interface ItemChange {
  remainingDelta?: number;
  reservedDelta?: number;
}

export interface ItemAllocation {
  item: Item;
  baseQuantity: number;
}

/**
 * FEFO (first-expired, first-out): hạn dùng sớm nhất trước, item không có hạn dùng xếp cuối; cùng
 * hạn thì nhập trước xuất trước; cuối cùng `createdAt`/`id` để thứ tự luôn xác định.
 */
export const compareFefo = (a: Item, b: Item): number => {
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
 * Item chỉ ĐỌC qua route của module này. Item `PENDING` do `ImportFormService` ghi/xoá dưới khoá
 * đầu phiếu nhập nháp (thêm/gỡ hàng, xoá nháp). Mọi thay đổi trạng thái/số lượng sau đó đi qua các
 * cửa sau, đều chạy trong transaction của caller:
 * - `receiveImportForm` — xác nhận phiếu nhập: `PENDING` ⇒ `IN_STOCK`.
 * - `voidImportForm` — huỷ phiếu nhập: `PENDING` ⇒ `VOID`.
 * - `reserve` — hàng vào phiếu xuất nháp (tạo / PATCH dòng): giữ chỗ (chỉ định hoặc FEFO).
 * - `consumeReserved` — xác nhận phiếu xuất: trừ đúng phần đã giữ.
 * - `release` — PATCH dòng / xoá / huỷ phiếu nháp hoặc `PENDING`: trả lại phần đã giữ.
 */
@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async findAll(
    warehouseSlug: string,
    query: GetAllItemRequestDto,
  ): Promise<AppPaginatedResponseDto<ItemResponseDto>> {
    // `SUPER_ADMIN`/`ADMIN` bypass `WarehouseScopeGuard` ⇒ kho sai phải báo 404, không trả rỗng.
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);

    const where: FindOptionsWhere<Item> = { warehouse: { id: warehouse.id } };
    if (query.materialSlug) where.material = { slug: query.materialSlug };
    if (query.code) where.code = query.code;
    if (query.status !== undefined) where.status = query.status;
    // `LessThan` loại luôn item `expiryDate IS NULL` (so sánh với NULL không bao giờ đúng).
    if (query.expiryBefore) where.expiryDate = LessThan(query.expiryBefore);

    const [items, total] = await this.itemRepository.findAndCount({
      where,
      relations: RELATIONS,
      order: buildSortOrder<Item, ItemSortBy>(query, {
        expiryDate: ['expiryDate'],
        entryDate: ['entryDate'],
      }),
      skip: (query.page - 1) * query.size,
      take: query.size,
    });

    return toPaginatedResponse(this.mapper.mapArray(items, Item, ItemResponseDto), total, query);
  }

  async findOne(warehouseSlug: string, slug: string): Promise<ItemResponseDto> {
    const item = await this.itemRepository.findOne({
      where: { slug, warehouse: { slug: warehouseSlug } },
      relations: RELATIONS,
    });
    if (!item) {
      await findWarehouse(this.warehouseRepository, warehouseSlug);
      throw new ItemException(ItemValidation.ITEM_NOT_FOUND);
    }
    return this.mapper.map(item, Item, ItemResponseDto);
  }

  /**
   * Xác nhận phiếu nhập: mọi item `PENDING` của phiếu ⇒ `IN_STOCK`, ngày nhập = ngày phiếu (đã khoá
   * đầu phiếu ở caller). Item `PENDING` không nằm trong tập FEFO khoá (`ITEM_ON_HAND_STATUSES`) nên
   * không tranh khoá với phiếu xuất. Trả số item đã nhập kho.
   */
  async receiveImportForm(manager: EntityManager, form: ImportForm): Promise<number> {
    const { affected } = await manager.update(
      Item,
      { importForm: Equal(form.id), status: ItemStatus.Pending },
      { status: ItemStatus.InStock, entryDate: form.date },
    );
    this.logger.log(
      `Received ${affected ?? 0} item(s) from import form ${form.id}`,
      `${ItemService.name}.${this.receiveImportForm.name}`,
    );
    return affected ?? 0;
  }

  /** Huỷ phiếu nhập: mọi item `PENDING` của phiếu ⇒ `VOID` (giữ lại làm dấu vết, mã không cấp lại). */
  async voidImportForm(manager: EntityManager, formId: string): Promise<void> {
    await manager.update(
      Item,
      { importForm: Equal(formId), status: ItemStatus.Pending },
      { status: ItemStatus.Void },
    );
  }

  /**
   * Hàng vào phiếu xuất nháp (tạo / PATCH dòng): GIỮ CHỖ trên item, trong transaction của caller.
   * Trả map `key` → các item đã giữ (theo thứ tự lấy) để caller tách dòng. Chỉ lấy phần còn trống
   * `remainingQuantity - reservedQuantity`; thiếu ⇒ `ITEM_INSUFFICIENT`.
   *
   * - Dòng chỉ định item được giữ TRƯỚC dòng FEFO: FEFO không được ăn mất lượng mà dòng khác đã
   *   chỉ định đích danh.
   * - Dòng không chỉ định item: FEFO, item đã chọn được ghi lại trên dòng (caller tách dòng) — lúc
   *   xác nhận trừ đúng những item đã giữ, không chọn lại.
   */
  async reserve(
    manager: EntityManager,
    warehouseId: string,
    lines: ItemConsumeLine[],
  ): Promise<Map<string, ItemAllocation[]>> {
    const result = new Map<string, ItemAllocation[]>();
    await this.forEachMaterial(manager, warehouseId, lines, async (group, ordered, write) => {
      const free = new Map(
        ordered.map((item) => [
          item.id,
          roundToScale(item.remainingQuantity - item.reservedQuantity),
        ]),
      );
      const take = (item: Item, quantity: number) => {
        free.set(item.id, roundToScale(free.get(item.id)! - quantity));
        write(item, { reservedDelta: quantity });
      };

      for (const line of group.filter((l) => l.itemId)) {
        const item = ordered.find(({ id }) => id === line.itemId);
        const quantity = roundToScale(line.baseQuantity);
        if (!item || free.get(item.id)! < quantity)
          throw new ItemException(ItemValidation.ITEM_INSUFFICIENT);
        take(item, quantity);
        result.set(line.key, [{ item, baseQuantity: quantity }]);
      }

      for (const line of group.filter((l) => !l.itemId)) {
        let need = roundToScale(line.baseQuantity);
        const allocations: ItemAllocation[] = [];
        for (const item of ordered) {
          if (need <= 0) break;
          const available = free.get(item.id)!;
          if (available <= 0) continue;
          const quantity = Math.min(available, need);
          take(item, quantity);
          need = roundToScale(need - quantity);
          allocations.push({ item, baseQuantity: quantity });
        }
        if (need > 0) throw new ItemException(ItemValidation.ITEM_INSUFFICIENT);
        result.set(line.key, allocations);
      }
    });
    return result;
  }

  /**
   * Xác nhận phiếu `PENDING`: trừ `remainingQuantity` VÀ `reservedQuantity` của đúng item đã giữ
   * lúc vào phiếu nháp. Mỗi dòng phải có `itemId` (giữ chỗ đã tách dòng theo item). Item xuất hết
   * chuyển sang trạng thái theo `exportType` (`ISSUED` / `DISPOSED` / `IN_TRANSIT`).
   */
  async consumeReserved(
    manager: EntityManager,
    warehouseId: string,
    lines: ItemConsumeLine[],
    exportType: ExportFormType,
  ): Promise<void> {
    await this.applyToReserved(
      manager,
      warehouseId,
      lines,
      (quantity) => ({ remainingDelta: -quantity, reservedDelta: -quantity }),
      exportType,
    );
  }

  /** Trả lại phần đã giữ trên từng item (`reservedQuantity` giảm, hết giữ chỗ ⇒ `IN_STOCK`). */
  async release(
    manager: EntityManager,
    warehouseId: string,
    lines: ItemConsumeLine[],
  ): Promise<void> {
    await this.applyToReserved(manager, warehouseId, lines, (quantity) => ({
      reservedDelta: -quantity,
    }));
  }

  private async applyToReserved(
    manager: EntityManager,
    warehouseId: string,
    lines: ItemConsumeLine[],
    toChange: (quantity: number) => ItemChange,
    exportType?: ExportFormType,
  ): Promise<void> {
    await this.forEachMaterial(
      manager,
      warehouseId,
      lines,
      async (group, ordered, write) => {
        for (const line of group) {
          const item = ordered.find(({ id }) => id === line.itemId);
          if (!item) throw new ItemException(ItemValidation.ITEM_RESERVED_INVALID);
          write(item, toChange(roundToScale(line.baseQuantity)));
        }
      },
      exportType,
    );
  }

  /**
   * Khung chung của mọi thay đổi item từ phiếu xuất, trong transaction của caller:
   *
   * - Khoá (`FOR UPDATE`) mọi item còn hàng (`IN_STOCK`/`RESERVED`) của từng vật tư trong kho, vật
   *   tư xử lý theo thứ tự `id` cố định — CẢ 3 luồng (giữ chỗ / xác nhận / trả lại) khoá cùng 1 kiểu
   *   nên không deadlock lẫn nhau. Item đang được giữ chỗ luôn còn hàng nên nằm trong tập đã khoá.
   *   Lọc bằng `Equal(id)` trên quan hệ để TypeORM so thẳng cột FK — `{ material: { id } }` sinh
   *   LEFT JOIN và MySQL khoá luôn dòng vật tư/kho.
   * - `handle` gom thay đổi qua `write`; cuối cùng kiểm bất biến
   *   `0 <= reserved <= remaining` rồi ghi các item có đổi, `status` theo `statusOfItem` (item xuất
   *   hết lấy trạng thái theo `exportType`).
   */
  private async forEachMaterial(
    manager: EntityManager,
    warehouseId: string,
    lines: ItemConsumeLine[],
    handle: (
      group: ItemConsumeLine[],
      ordered: Item[],
      write: (item: Item, change: ItemChange) => void,
    ) => Promise<void>,
    exportType?: ExportFormType,
  ): Promise<void> {
    const byMaterial = new Map<string, ItemConsumeLine[]>();
    for (const line of lines) {
      const group = byMaterial.get(line.materialId) ?? [];
      group.push(line);
      byMaterial.set(line.materialId, group);
    }

    const repository = manager.getRepository(Item);
    for (const materialId of [...byMaterial.keys()].sort()) {
      const locked = await repository.find({
        where: {
          warehouse: Equal(warehouseId),
          material: Equal(materialId),
          status: In(ITEM_ON_HAND_STATUSES),
        },
        lock: { mode: 'pessimistic_write' },
      });
      const ordered = [...locked].sort(compareFefo);
      const next = new Map(
        ordered.map((item) => [
          item.id,
          { remaining: item.remainingQuantity, reserved: item.reservedQuantity },
        ]),
      );
      await handle(byMaterial.get(materialId)!, ordered, (item, change) => {
        const value = next.get(item.id)!;
        value.remaining = roundToScale(value.remaining + (change.remainingDelta ?? 0));
        value.reserved = roundToScale(value.reserved + (change.reservedDelta ?? 0));
      });

      for (const item of ordered) {
        const { remaining, reserved } = next.get(item.id)!;
        if (remaining === item.remainingQuantity && reserved === item.reservedQuantity) continue;
        if (reserved < 0 || remaining < reserved)
          throw new ItemException(ItemValidation.ITEM_RESERVED_INVALID);
        const status = statusOfItem(remaining, reserved, exportType);
        await repository.update(
          { id: item.id },
          { remainingQuantity: remaining, reservedQuantity: reserved, status },
        );
        item.remainingQuantity = remaining;
        item.reservedQuantity = reserved;
        item.status = status;
      }
    }
  }
}
