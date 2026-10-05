import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager, FindOptionsWhere, Raw, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AdjustInventoryQuantityRequestDto,
  AssignInventoryRequestDto,
  GetInventoryHistoryRequestDto,
  GetInventoryRequestDto,
  UpdateInventoryRequestDto,
  InventoryHistoryResponseDto,
  InventoryResponseDto,
} from './inventory.dto';
import { Inventory } from './inventory.entity';
import { InventoryHistory } from './inventory-history.entity';
import { InventoryHistoryAction } from './inventory.constants';
import { InventoryException } from './inventory.exception';
import { InventoryValidation } from './inventory.validation';
import { effectiveMaximum, effectiveMinimum } from './inventory.util';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { Material } from 'src/material/material.entity';
import { MaterialService } from 'src/material/material.service';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { CurrentUserDto } from 'src/user/user.decorator';
import { User } from 'src/user/user.entity';

/** Quan hệ đủ để dựng response: `warehouse`, `material` và `material.type` (cả 3 đều không `eager`). */
const RELATIONS = { warehouse: true, material: { type: true } } as const;

/**
 * Khoá dòng tồn (`SELECT ... FOR UPDATE`) trước khi đọc-rồi-ghi `quantity`/`reservedQuantity`: 2
 * request đồng thời trên cùng 1 dòng chạy nối tiếp, nên không mất cập nhật và snapshot
 * before/after trong `InventoryHistory` khớp đúng thứ tự thực tế. Luôn khoá KHÔNG kèm relations —
 * MySQL khoá cả các dòng của bảng được JOIN (kho, vật tư).
 */
const WRITE_LOCK = { mode: 'pessimistic_write' } as const;

/** 1 thay đổi tồn cần ghi; delta theo đơn vị cơ sở, đã qua `roundToScale`. */
interface InventoryChange {
  action: InventoryHistoryAction;
  quantityDelta?: number;
  reservedDelta?: number;
  note?: string | null;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(InventoryHistory)
    private readonly historyRepository: Repository<InventoryHistory>,
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly materialService: MaterialService,
    private readonly transactionManager: TransactionManagerService,
  ) {}

  async assignMaterial(
    warehouseSlug: string,
    dto: AssignInventoryRequestDto,
    actor: CurrentUserDto,
  ): Promise<InventoryResponseDto> {
    const context = `${InventoryService.name}.${this.assignMaterial.name}`;
    const warehouse = await this.findWarehouse(warehouseSlug);
    if (!warehouse.isActive)
      throw new InventoryException(InventoryValidation.INVENTORY_WAREHOUSE_INACTIVE);

    const material = await this.materialService.findEntityBySlug(dto.materialSlug);

    // UNIQUE(warehouse, material) không bỏ qua row xoá mềm, nên phải tự tra kèm `withDeleted` thay
    // vì để MySQL ném `ER_DUP_ENTRY` thành 500.
    const existed = await this.inventoryRepository.findOne({
      where: { warehouse: { id: warehouse.id }, material: { id: material.id } },
      withDeleted: true,
    });
    if (existed) throw new InventoryException(InventoryValidation.INVENTORY_DOES_EXIST);

    const row = this.inventoryRepository.create({
      warehouse,
      material,
      quantity: roundToScale(Number(dto.quantity ?? 0)),
      reservedQuantity: 0,
      minimumInventory: dto.minimumInventory ?? null,
      maximumInventory: dto.maximumInventory ?? null,
    });
    this.assertEffectiveRange(row);

    // Dòng mới nên chưa cần khoá; chỉ cần dòng tồn và dòng lịch sử `ASSIGN` cùng commit/rollback.
    const created = await this.transactionManager.execute(async (manager) => {
      const saved = await manager.getRepository(Inventory).save(row);
      await this.recordHistory(
        manager,
        saved,
        { action: InventoryHistoryAction.Assign, quantityDelta: saved.quantity },
        { quantity: 0, reservedQuantity: 0 },
        actor,
      );
      return saved;
    });
    this.logger.log(
      `Material ${material.id} assigned to warehouse ${warehouse.id}: ${created.id}`,
      context,
    );
    return this.toResponse(created);
  }

  async findAll(
    warehouseSlug: string,
    query: GetInventoryRequestDto,
  ): Promise<AppPaginatedResponseDto<InventoryResponseDto>> {
    const warehouse = await this.findWarehouse(warehouseSlug);

    // 2 filter `belowMinimum`/`aboveMaximum` so với ngưỡng EFFECTIVE (`COALESCE(override, mặc định
    // của material)`) — so cột với cột nên phải dùng `Raw`. `Raw` đặt trên cột của `material` để
    // TypeORM truyền vào alias của bảng material đã join; phía `Inventory` là alias gốc mà
    // `find*` luôn đặt bằng `metadata.name`. Viết theo tên property (`quantity`, `minimumInventory`),
    // TypeORM tự đổi sang tên cột thật. Lọc ở SQL để phân trang vẫn đúng tổng số.
    const wm = this.inventoryRepository.metadata.name;
    const materialWhere: FindOptionsWhere<Material> = {};
    if (query.typeSlug) materialWhere.type = { slug: query.typeSlug };
    if (query.belowMinimum === true)
      materialWhere.minimumInventory = Raw(
        (minimum) => `${wm}.quantity < COALESCE(${wm}.minimumInventory, ${minimum})`,
      );
    if (query.aboveMaximum === true)
      materialWhere.maximumInventory = Raw(
        (maximum) => `${wm}.quantity > COALESCE(${wm}.maximumInventory, ${maximum})`,
      );

    const [items, total] = await this.inventoryRepository.findAndCount({
      where: { warehouse: { id: warehouse.id }, material: materialWhere },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });

    const totalPages = Math.ceil(total / query.size);
    return {
      items: this.mapper.mapArray(items, Inventory, InventoryResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<InventoryResponseDto>;
  }

  async updateThresholds(
    warehouseSlug: string,
    materialSlug: string,
    dto: UpdateInventoryRequestDto,
  ): Promise<InventoryResponseDto> {
    const context = `${InventoryService.name}.${this.updateThresholds.name}`;
    const row = await this.findRow(warehouseSlug, materialSlug);

    // `undefined` = client không gửi field (giữ nguyên); `null` = gửi null (bỏ override). Phân biệt
    // 2 cái này bằng `in`/`!== undefined`, đừng dùng `??` — nó nuốt mất ý nghĩa của `null`.
    if (dto.minimumInventory !== undefined) row.minimumInventory = dto.minimumInventory;
    if (dto.maximumInventory !== undefined) row.maximumInventory = dto.maximumInventory;
    this.assertEffectiveRange(row);

    const updated = await this.inventoryRepository.save(row);
    this.logger.log(`Inventory thresholds updated: ${updated.id}`, context);
    return this.toResponse(updated);
  }

  async adjustQuantity(
    warehouseSlug: string,
    materialSlug: string,
    dto: AdjustInventoryQuantityRequestDto,
    actor: CurrentUserDto,
  ): Promise<InventoryResponseDto> {
    const context = `${InventoryService.name}.${this.adjustQuantity.name}`;
    // `@IsNotEmpty()` của class-validator KHÔNG chặn số 0 (0 không phải "empty"), nên phải chặn ở
    // đây. KHÔNG `Math.trunc`: tồn là DECIMAL(18,6) nên delta lẻ là hợp lệ — cắt phần thập phân
    // sẽ nuốt mất lượng nhập theo đơn vị nhỏ hơn đơn vị cơ sở.
    const delta = roundToScale(Number(dto.delta));
    if (!Number.isFinite(delta) || delta === 0)
      throw new InventoryException(InventoryValidation.INVENTORY_DELTA_INVALID);

    const row = await this.findRow(warehouseSlug, materialSlug);
    await this.transactionManager.execute((manager) =>
      this.mutate(
        manager,
        row.id,
        { action: InventoryHistoryAction.Adjust, quantityDelta: delta, note: dto.note },
        actor,
      ),
    );

    this.logger.log(`Inventory ${row.id} quantity adjusted by ${delta}`, context);
    return this.toResponse(await this.findRow(warehouseSlug, materialSlug));
  }

  async removeMaterial(
    warehouseSlug: string,
    materialSlug: string,
    actor: CurrentUserDto,
  ): Promise<number> {
    const context = `${InventoryService.name}.${this.removeMaterial.name}`;
    const row = await this.findRow(warehouseSlug, materialSlug);

    // Gỡ khi còn tồn / còn giữ chỗ là mất dấu số lượng đang nằm trong kho hoặc đã hứa cho phiếu
    // xuất — bắt xuất/huỷ giữ chỗ hết trước. Check trên bản ĐÃ KHOÁ, không phải bản `findRow` ở
    // trên: giữa 2 lần đọc có thể có adjust khác chen vào.
    await this.transactionManager.execute(async (manager) => {
      const locked = await this.mutate(
        manager,
        row.id,
        { action: InventoryHistoryAction.Remove },
        actor,
        (current) => {
          if (current.quantity > 0)
            throw new InventoryException(InventoryValidation.INVENTORY_QUANTITY_NOT_EMPTY);
          if (current.reservedQuantity > 0)
            throw new InventoryException(InventoryValidation.INVENTORY_RESERVED_NOT_EMPTY);
        },
      );
      await manager.getRepository(Inventory).softRemove(locked);
    });

    this.logger.log(`Inventory removed: ${row.id}`, context);
    return 1;
  }

  async findHistories(
    warehouseSlug: string,
    materialSlug: string,
    query: GetInventoryHistoryRequestDto,
  ): Promise<AppPaginatedResponseDto<InventoryHistoryResponseDto>> {
    const row = await this.findRow(warehouseSlug, materialSlug);

    const [items, total] = await this.historyRepository.findAndCount({
      where: { inventory: { id: row.id } },
      relations: { changedBy: true },
      // Người thao tác bị xoá mềm sau đó vẫn phải hiện trong lịch sử.
      withDeleted: true,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, InventoryHistory, InventoryHistoryResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<InventoryHistoryResponseDto>;
  }

  /**
   * Lõi chung của mọi thay đổi tồn, chạy trong transaction của caller: khoá dòng tồn → `guard` (rào
   * riêng của từng luồng, đọc trên bản đã khoá) → kiểm bất biến `0 <= reserved <= quantity` → ghi
   * giá trị mới → ghi `InventoryHistory`. Trả bản đã khoá (KHÔNG kèm relations) với giá trị mới.
   */
  private async mutate(
    manager: EntityManager,
    inventoryId: string,
    change: InventoryChange,
    actor: CurrentUserDto,
    guard?: (current: Inventory) => void,
  ): Promise<Inventory> {
    const inventories = manager.getRepository(Inventory);
    const row = await inventories.findOne({ where: { id: inventoryId }, lock: WRITE_LOCK });
    // Bị gỡ khỏi kho giữa `findRow` của caller và lúc lấy được khoá.
    if (!row) throw new InventoryException(InventoryValidation.INVENTORY_NOT_FOUND);
    guard?.(row);

    const before = { quantity: row.quantity, reservedQuantity: row.reservedQuantity };
    const quantity = roundToScale(before.quantity + (change.quantityDelta ?? 0));
    const reservedQuantity = roundToScale(before.reservedQuantity + (change.reservedDelta ?? 0));
    if (quantity < 0) throw new InventoryException(InventoryValidation.INVENTORY_QUANTITY_NEGATIVE);
    if (reservedQuantity < 0 || quantity < reservedQuantity)
      throw new InventoryException(InventoryValidation.INVENTORY_QUANTITY_BELOW_RESERVED);

    if (quantity !== before.quantity || reservedQuantity !== before.reservedQuantity)
      await inventories.update({ id: row.id }, { quantity, reservedQuantity });
    row.quantity = quantity;
    row.reservedQuantity = reservedQuantity;

    await this.recordHistory(manager, row, change, before, actor);
    return row;
  }

  /** `row` mang giá trị SAU thay đổi, `before` là snapshot trước đó. */
  private async recordHistory(
    manager: EntityManager,
    row: Inventory,
    change: InventoryChange,
    before: Pick<Inventory, 'quantity' | 'reservedQuantity'>,
    actor: CurrentUserDto,
  ): Promise<void> {
    const histories = manager.getRepository(InventoryHistory);
    await histories.save(
      histories.create({
        inventory: { id: row.id } as Inventory,
        action: change.action,
        quantityDelta: change.quantityDelta ?? 0,
        quantityBefore: before.quantity,
        quantityAfter: row.quantity,
        reservedDelta: change.reservedDelta ?? 0,
        reservedBefore: before.reservedQuantity,
        reservedAfter: row.reservedQuantity,
        note: change.note ?? null,
        changedBy: { id: actor.userId } as User,
      }),
    );
  }

  private async findWarehouse(slug: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    return warehouse;
  }

  private async findRow(warehouseSlug: string, materialSlug: string): Promise<Inventory> {
    const row = await this.inventoryRepository.findOne({
      where: { warehouse: { slug: warehouseSlug }, material: { slug: materialSlug } },
      relations: RELATIONS,
    });
    // Kho không tồn tại cũng rơi vào đây; tách ra để client phân biệt được 2 tình huống.
    if (!row) {
      await this.findWarehouse(warehouseSlug);
      throw new InventoryException(InventoryValidation.INVENTORY_NOT_FOUND);
    }
    return row;
  }

  /**
   * So bằng ngưỡng EFFECTIVE, không so 2 giá trị override với nhau: override 1 vế mà vế kia lấy của
   * `Material` vẫn phải ra một khoảng hợp lệ, nếu không client dựng được cặp ngưỡng mâu thuẫn
   * (min 50 override, max 10 của material) mà không endpoint nào báo lỗi.
   */
  private assertEffectiveRange(row: Inventory): void {
    if (effectiveMaximum(row) < effectiveMinimum(row))
      throw new InventoryException(InventoryValidation.INVENTORY_RANGE_INVALID);
  }

  private toResponse(row: Inventory): InventoryResponseDto {
    return this.mapper.map(row, Inventory, InventoryResponseDto);
  }
}
