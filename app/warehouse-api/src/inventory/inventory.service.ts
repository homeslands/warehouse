import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AdjustInventoryQuantityRequestDto,
  AssignInventoryRequestDto,
  CreateInventoryMaterialRequestDto,
  GenerateMaterialBarcodeResponseDto,
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
import { effectiveMaximum, effectiveMinimum, InventoryRow } from './inventory.util';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { MaterialService } from 'src/material/material.service';
import { CreateMaterialRequestDto } from 'src/material/material.dto';
import { insertMaterialSuppliers } from 'src/material/material-supplier.util';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierException } from 'src/supplier/supplier.exception';
import { SupplierValidation } from 'src/supplier/supplier.validation';
import { findWarehouse } from 'src/warehouse/warehouse.util';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { CurrentUserDto } from 'src/user/user.decorator';
import { User } from 'src/user/user.entity';
import { toPaginatedResponse } from 'src/shared/utils/pagination.util';
import { WRITE_LOCK } from 'src/shared/utils/lock.util';
import { CodeGenerateService } from 'src/code-generate/code-generate.service';
import { CodeType } from 'src/code-generate/code-generate.constants';

/**
 * Quan hệ đủ để dựng response: `warehouse`, `material` kèm `type`/`baseUnit` và mọi đơn vị của vật
 * tư (`unitsCanHave.unit`) — đều không `eager`.
 */
const RELATIONS = {
  warehouse: true,
  material: { type: true, baseUnit: true, unitsCanHave: { unit: true } },
} as const;

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
    // Chỉ tra nhà cung cấp theo slug cho `createMaterialInWarehouse` — entity, không import `SupplierModule`.
    @InjectRepository(Supplier) private readonly supplierRepository: Repository<Supplier>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly materialService: MaterialService,
    private readonly transactionManager: TransactionManagerService,
    private readonly codeGenerateService: CodeGenerateService,
  ) {}

  /**
   * Cấp trước mã vạch EAN-13 (`CodeType.Barcode`) cho vật tư mới sắp gán vào kho này — dùng khi sản
   * phẩm không có mã vạch của nhà sản xuất. Chỉ cấp, KHÔNG tạo vật tư: client in tem rồi gửi lại ở
   * `material.barcode` của `POST /warehouses/:slug/materials`. Không cấp mã vật tư ở đây: `code` tự
   * sinh lúc tạo vật tư. Số cấp ra mà không dùng thì bỏ trống, bộ đếm không bao giờ cấp lại.
   */
  async generateMaterialBarcode(
    warehouseSlug: string,
  ): Promise<GenerateMaterialBarcodeResponseDto> {
    const context = `${InventoryService.name}.${this.generateMaterialBarcode.name}`;
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);
    if (!warehouse.isActive)
      throw new InventoryException(InventoryValidation.INVENTORY_WAREHOUSE_INACTIVE);

    const barcode = await this.transactionManager.execute((manager) =>
      this.codeGenerateService.generate(manager, CodeType.Barcode, warehouse),
    );
    this.logger.log(`Barcode generated for warehouse ${warehouse.id}: ${barcode}`, context);
    return { barcode };
  }

  async assignMaterial(
    warehouseSlug: string,
    dto: AssignInventoryRequestDto,
    actor: CurrentUserDto,
  ): Promise<InventoryResponseDto> {
    const context = `${InventoryService.name}.${this.assignMaterial.name}`;
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);
    if (!warehouse.isActive)
      throw new InventoryException(InventoryValidation.INVENTORY_WAREHOUSE_INACTIVE);

    const material = await this.materialService.findEntityBySlug(dto.materialSlug);
    const initialQuantity = roundToScale(Number(dto.quantity ?? 0));
    const minimumInventory = dto.minimumInventory ?? null;
    const maximumInventory = dto.maximumInventory ?? null;

    // `UQ_inventory(warehouse, material)` tính cả row xoá mềm: đọc và khoá trong transaction
    // (`withDeleted: true`) để 2 request đồng thời không ghi đè `quantity` của nhau; phần gán tồn
    // đi qua `mutate()` để giữ khoá dòng và ghi lịch sử (`ASSIGN` lần đầu, `REASSIGN` khi gán lại).
    const assigned = await this.transactionManager.execute(async (manager) => {
      const repo = manager.getRepository(Inventory);
      const existed = await repo.findOne({
        where: { warehouse: { id: warehouse.id }, material: { id: material.id } },
        withDeleted: true,
        lock: WRITE_LOCK,
      });
      if (existed && !existed.deletedAt)
        throw new InventoryException(InventoryValidation.INVENTORY_DOES_EXIST);

      this.assertEffectiveRange({ minimumInventory, maximumInventory, material });

      let inventoryId: string;
      let action: InventoryHistoryAction;
      if (existed) {
        await repo.update(
          { id: existed.id },
          {
            quantity: 0,
            reservedQuantity: 0,
            minimumInventory,
            maximumInventory,
            reassignedAt: new Date(),
            deletedAt: null,
          },
        );
        inventoryId = existed.id;
        action = InventoryHistoryAction.Reassign;
      } else {
        const inserted = await repo.save(
          this.inventoryRepository.create({
            warehouse,
            material,
            quantity: 0,
            reservedQuantity: 0,
            minimumInventory,
            maximumInventory,
            reassignedAt: null,
          }),
        );
        inventoryId = inserted.id;
        action = InventoryHistoryAction.Assign;
      }

      return this.mutate(manager, inventoryId, { action, quantityDelta: initialQuantity }, actor);
    });
    this.logger.log(
      `Material ${material.id} assigned to warehouse ${warehouse.id}: ${assigned.id}`,
      context,
    );
    // Đọc lại kèm `RELATIONS`: `findEntityBySlug` không load đơn vị của vật tư (`units`).
    return this.toResponse(await this.findRow(warehouseSlug, material.slug));
  }

  /**
   * Tạo vật tư MỚI rồi gán luôn vào kho — tất cả trong 1 transaction: tạo vật tư (+ dòng join đơn
   * vị cơ sở), dòng tồn, dòng lịch sử `ASSIGN`. Lỗi ở bất kỳ bước nào (trùng mã vật tư, ngưỡng của
   * kho mâu thuẫn với ngưỡng mặc định...) thì không để lại vật tư "mồ côi" không thuộc kho nào.
   * Vật tư mới nên không cần tra trùng `(kho, vật tư)` như `assignMaterial`. Có `supplierSlug` thì
   * gắn luôn cặp (vật tư, nhà cung cấp) vào `material_supplier_tbl` trong cùng transaction.
   * `material.code` bỏ trống thì tự sinh (`CodeType.Item`) trong cùng transaction.
   */
  async createMaterialInWarehouse(
    warehouseSlug: string,
    dto: CreateInventoryMaterialRequestDto,
    actor: CurrentUserDto,
  ): Promise<InventoryResponseDto> {
    const context = `${InventoryService.name}.${this.createMaterialInWarehouse.name}`;
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);
    if (!warehouse.isActive)
      throw new InventoryException(InventoryValidation.INVENTORY_WAREHOUSE_INACTIVE);
    // Tra TRƯỚC transaction để slug sai không chạm DB. Bỏ qua nhà cung cấp đã xoá mềm.
    const supplier = dto.supplierSlug ? await this.findSupplier(dto.supplierSlug) : null;
    const initialQuantity = roundToScale(Number(dto.quantity ?? 0));

    const created = await this.transactionManager.execute(async (manager) => {
      // Không gửi `code` ⇒ sinh trong CHÍNH transaction này: tạo vật tư hỏng thì bộ đếm rollback
      // theo, không đốt số. Gửi `code` thì giữ nguyên (vẫn qua rào trùng của `MaterialService`).
      const materialDto: CreateMaterialRequestDto = dto.material.code
        ? (dto.material as CreateMaterialRequestDto)
        : {
            ...dto.material,
            code: await this.codeGenerateService.generate(manager, CodeType.Item, warehouse),
          };
      const material = await this.materialService.createMaterialIn(manager, materialDto);
      if (supplier)
        await insertMaterialSuppliers(manager, [
          { materialId: material.id, supplierId: supplier.id },
        ]);
      const row = this.inventoryRepository.create({
        warehouse,
        material,
        quantity: 0,
        reservedQuantity: 0,
        minimumInventory: dto.minimumInventory ?? null,
        maximumInventory: dto.maximumInventory ?? null,
        reassignedAt: null,
      });
      this.assertEffectiveRange(row);

      const saved = await manager.getRepository(Inventory).save(row);
      const mutated = await this.mutate(
        manager,
        saved.id,
        { action: InventoryHistoryAction.Assign, quantityDelta: initialQuantity },
        actor,
      );
      mutated.warehouse = warehouse;
      mutated.material = material;
      return mutated;
    });
    this.logger.log(
      `Material ${created.material.id} created in warehouse ${warehouse.id}: ${created.id}` +
        (supplier ? `, supplier ${supplier.id}` : ''),
      context,
    );
    return this.toResponse(created);
  }

  async findAll(
    warehouseSlug: string,
    query: GetInventoryRequestDto,
  ): Promise<AppPaginatedResponseDto<InventoryResponseDto>> {
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);

    // Sắp xếp ưu tiên ngày gán lại gần nhất (`COALESCE(reassignedAt, createdAt) DESC`) và lọc
    // ngưỡng ở SQL trước khi hydrate `RELATIONS` (có quan hệ 1-nhiều `unitsCanHave`) để phân trang
    // luôn đúng tổng số dòng tồn.
    const qb = this.inventoryRepository
      .createQueryBuilder('inventory')
      .innerJoin('inventory.material', 'material')
      .where('inventory.warehouse = :warehouseId', { warehouseId: warehouse.id });

    if (query.typeSlug) {
      qb.innerJoin('material.type', 'type').andWhere('type.slug = :typeSlug', {
        typeSlug: query.typeSlug,
      });
    }
    if (query.belowMinimum === true) {
      qb.andWhere(
        'inventory.quantity < COALESCE(inventory.minimumInventory, material.minimumInventory)',
      );
    }
    if (query.aboveMaximum === true) {
      // `0` là không giới hạn (quy ước BA) — `NULLIF(..., 0)` để so sánh với `NULL` trả về false.
      qb.andWhere(
        'inventory.quantity > NULLIF(COALESCE(inventory.maximumInventory, material.maximumInventory), 0)',
      );
    }

    qb.orderBy('COALESCE(inventory.reassigned_at_column, inventory.created_at_column)', 'DESC')
      .addOrderBy('inventory.id_column', 'DESC')
      .offset((query.page - 1) * query.size)
      .limit(query.size);

    const [pageRows, total] = await qb.getManyAndCount();
    const ids = pageRows.map((row) => row.id);
    const hydrated = ids.length
      ? await this.inventoryRepository.find({
          where: { id: In(ids) },
          relations: RELATIONS,
        })
      : [];
    const byId = new Map(hydrated.map((row) => [row.id, row]));
    const items = ids.map((id) => byId.get(id)).filter((row): row is Inventory => Boolean(row));

    return toPaginatedResponse(
      this.mapper.mapArray(items, Inventory, InventoryResponseDto),
      total,
      query,
    );
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

  /**
   * Nhập hàng vào kho từ phiếu nhập đã xác nhận. Chạy trong transaction của CALLER — cộng tồn và đổi
   * trạng thái phiếu cùng commit/rollback. `lines[].quantity` theo đơn vị cơ sở (`baseQuantity` của
   * dòng phiếu); nhiều dòng cùng vật tư (khác đơn vị) gộp thành 1 lần cộng + 1 dòng lịch sử `IMPORT`.
   *
   * Vật tư chưa gán vào kho ⇒ `INVENTORY_NOT_FOUND`, KHÔNG tự gán: gán vật tư vào kho là thao tác
   * quản trị riêng (`POST /warehouses/:slug/materials`). Khoá các dòng tồn theo thứ tự `id` cố định
   * để 2 phiếu cùng vật tư xác nhận đồng thời không deadlock.
   */
  async receive(
    manager: EntityManager,
    warehouseId: string,
    lines: { materialId: string; quantity: number }[],
    actor: CurrentUserDto,
    note?: string | null,
  ): Promise<void> {
    await this.applyPerMaterial(manager, warehouseId, lines, actor, (total) => ({
      action: InventoryHistoryAction.Import,
      quantityDelta: total,
      note,
    }));
  }

  /**
   * Xuất hàng khỏi kho theo phiếu xuất đã xác nhận — đối xứng với `receive`: chạy trong transaction
   * của CALLER, `lines[].quantity` theo đơn vị cơ sở (> 0), gộp theo vật tư thành 1 lần trừ + 1 dòng
   * lịch sử `EXPORT`, khoá dòng tồn theo thứ tự `id`. Không đủ tồn ⇒ `INVENTORY_QUANTITY_NEGATIVE`;
   * trừ lấn vào phần đã giữ chỗ ⇒ `INVENTORY_QUANTITY_BELOW_RESERVED` (cả hai từ `mutate`).
   *
   * `fromReserved` ⇒ lượng xuất là lượng phiếu đã giữ chỗ lúc gửi duyệt: trừ cả `reservedQuantity`.
   */
  async issue(
    manager: EntityManager,
    warehouseId: string,
    lines: { materialId: string; quantity: number }[],
    actor: CurrentUserDto,
    note?: string | null,
    options: { fromReserved?: boolean } = {},
  ): Promise<void> {
    await this.applyPerMaterial(manager, warehouseId, lines, actor, (total) => ({
      action: InventoryHistoryAction.Export,
      quantityDelta: -total,
      reservedDelta: options.fromReserved ? -total : 0,
      note,
    }));
  }

  /**
   * Giữ chỗ cho phiếu xuất gửi duyệt (`DRAFT` → `PENDING`), trong transaction của caller: cộng
   * `reservedQuantity`, lịch sử `RESERVE`. Phần còn trống (`quantity - reservedQuantity`) không đủ ⇒
   * `INVENTORY_AVAILABLE_INSUFFICIENT`.
   */
  async reserve(
    manager: EntityManager,
    warehouseId: string,
    lines: { materialId: string; quantity: number }[],
    actor: CurrentUserDto,
    note?: string | null,
  ): Promise<void> {
    await this.applyPerMaterial(
      manager,
      warehouseId,
      lines,
      actor,
      (total) => ({ action: InventoryHistoryAction.Reserve, reservedDelta: total, note }),
      (current, total) => {
        if (roundToScale(current.quantity - current.reservedQuantity) < total)
          throw new InventoryException(InventoryValidation.INVENTORY_AVAILABLE_INSUFFICIENT);
      },
    );
  }

  /** Trả lại phần đã giữ chỗ khi huỷ phiếu xuất `PENDING`: trừ `reservedQuantity`, lịch sử `RELEASE`. */
  async release(
    manager: EntityManager,
    warehouseId: string,
    lines: { materialId: string; quantity: number }[],
    actor: CurrentUserDto,
    note?: string | null,
  ): Promise<void> {
    await this.applyPerMaterial(manager, warehouseId, lines, actor, (total) => ({
      action: InventoryHistoryAction.Release,
      reservedDelta: -total,
      note,
    }));
  }

  /**
   * Gộp `lines` theo vật tư, khoá + ghi từng dòng tồn theo thứ tự `id` cố định (2 phiếu cùng vật tư
   * chạy đồng thời không deadlock). Vật tư chưa gán vào kho ⇒ `INVENTORY_NOT_FOUND`.
   */
  private async applyPerMaterial(
    manager: EntityManager,
    warehouseId: string,
    lines: { materialId: string; quantity: number }[],
    actor: CurrentUserDto,
    toChange: (total: number) => InventoryChange,
    guard?: (current: Inventory, total: number) => void,
  ): Promise<void> {
    const totals = new Map<string, number>();
    for (const line of lines)
      totals.set(line.materialId, roundToScale((totals.get(line.materialId) ?? 0) + line.quantity));
    if (!totals.size) return;

    const rows = await manager.getRepository(Inventory).find({
      where: { warehouse: { id: warehouseId }, material: { id: In([...totals.keys()]) } },
      relations: { material: true },
    });
    if (rows.length !== totals.size)
      throw new InventoryException(InventoryValidation.INVENTORY_NOT_FOUND);

    const ordered = [...rows].sort((a, b) => a.id.localeCompare(b.id));
    for (const row of ordered) {
      const total = totals.get(row.material.id)!;
      await this.mutate(
        manager,
        row.id,
        toChange(total),
        actor,
        guard && ((current) => guard(current, total)),
      );
    }
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

    return toPaginatedResponse(
      this.mapper.mapArray(items, InventoryHistory, InventoryHistoryResponseDto),
      total,
      query,
    );
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
    // Khoá dòng tồn (`SELECT ... FOR UPDATE`) trước khi đọc-rồi-ghi `quantity`/`reservedQuantity`:
    // 2 request đồng thời trên cùng 1 dòng chạy nối tiếp, nên không mất cập nhật và snapshot
    // before/after trong `InventoryHistory` khớp đúng thứ tự thực tế. Luôn khoá KHÔNG kèm
    // relations — MySQL khoá cả các dòng của bảng được JOIN (kho, vật tư).
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

  /** Ném `SUPPLIER_NOT_FOUND` (lỗi của module supplier, cố ý không bọc lại) nếu slug sai. */
  private async findSupplier(slug: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOneBy({ slug });
    if (!supplier) throw new SupplierException(SupplierValidation.SUPPLIER_NOT_FOUND);
    return supplier;
  }

  private async findRow(warehouseSlug: string, materialSlug: string): Promise<Inventory> {
    const row = await this.inventoryRepository.findOne({
      where: { warehouse: { slug: warehouseSlug }, material: { slug: materialSlug } },
      relations: RELATIONS,
    });
    // Kho không tồn tại cũng rơi vào đây; tách ra để client phân biệt được 2 tình huống.
    if (!row) {
      await findWarehouse(this.warehouseRepository, warehouseSlug);
      throw new InventoryException(InventoryValidation.INVENTORY_NOT_FOUND);
    }
    return row;
  }

  /**
   * So bằng ngưỡng EFFECTIVE, không so 2 giá trị override với nhau: override 1 vế mà vế kia lấy của
   * `Material` vẫn phải ra một khoảng hợp lệ, nếu không client dựng được cặp ngưỡng mâu thuẫn
   * (min 50 override, max 10 của material) mà không endpoint nào báo lỗi.
   */
  private assertEffectiveRange(row: InventoryRow): void {
    const max = effectiveMaximum(row);
    // `max === null` (nghĩa là 0 = không giới hạn) không chặn dù `effectiveMinimum > 0`.
    if (max !== null && max < effectiveMinimum(row))
      throw new InventoryException(InventoryValidation.INVENTORY_RANGE_INVALID);
  }

  private toResponse(row: Inventory): InventoryResponseDto {
    return this.mapper.map(row, Inventory, InventoryResponseDto);
  }
}
