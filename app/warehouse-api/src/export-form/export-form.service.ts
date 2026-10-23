import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  EntityManager,
  FindOptionsRelations,
  FindOptionsWhere,
  In,
  Like,
  OptimisticLockVersionMismatchError,
  Repository,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  ChangeExportFormStatusRequestDto,
  CreateExportFormItemDto,
  CreateExportFormRequestDto,
  ExportFormResponseDto,
  ExportFormSortBy,
  GetAllExportFormRequestDto,
  UpdateExportFormRequestDto,
} from './export-form.dto';
import { ExportForm } from './export-form.entity';
import { ExportFormItem } from './export-form-item.entity';
import {
  EXPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES,
  EXPORT_FORM_UPLOAD_FOLDER,
  ExportFormStatus,
  ExportFormType,
} from './export-form.constants';
import { ExportFormException } from './export-form.exception';
import { ExportFormValidation } from './export-form.validation';
import { pickDefined } from 'src/shared/utils/obj.util';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { Material } from 'src/material/material.entity';
import { Inventory } from 'src/inventory/inventory.entity';
import { InventoryService } from 'src/inventory/inventory.service';
import { MaterialBatch } from 'src/material-batch/material-batch.entity';
import { MaterialBatchStatus } from 'src/material-batch/material-batch.constants';
import { BatchAllocation, MaterialBatchService } from 'src/material-batch/material-batch.service';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import {
  buildSortOrder,
  escapeLike,
  resolveDateRange,
  toDateRangeOperator,
} from 'src/shared/utils/query.util';
import { AuthorityCode, TAuthorityCode } from 'src/authority/authority.constants';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { User } from 'src/user/user.entity';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';
import { S3Service } from 'src/file/s3/s3.service';
import { FileException } from 'src/file/file.exception';
import { FileValidation } from 'src/file/file.validation';

const EXPORT_FORM_RELATIONS: FindOptionsRelations<ExportForm> = {
  requester: true,
  approver: true,
  warehouse: true,
};

/** Phiếu kèm dòng vật tư — dùng cho cả list và chi tiết. */
const EXPORT_FORM_DETAIL_RELATIONS: FindOptionsRelations<ExportForm> = {
  ...EXPORT_FORM_RELATIONS,
  items: { material: true, unit: true, batch: true },
};

/** Trần của DECIMAL(18,2) và DECIMAL(18,6). */
const MONEY_MAX = 1e16;
const QUANTITY_MAX = 1e12;

const roundMoney = (value: number) => Number(value.toFixed(2));

const fullName = (user: User) => `${user.lastName} ${user.firstName}`.trim();

/**
 * Mọi thao tác khoá theo kho ở route: tra phiếu luôn kèm `warehouse.slug` (xem `ImportFormService`).
 */
@Injectable()
export class ExportFormService {
  constructor(
    @InjectRepository(ExportForm) private readonly exportFormRepository: Repository<ExportForm>,
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Material) private readonly materialRepository: Repository<Material>,
    @InjectRepository(Inventory) private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(MaterialBatch) private readonly batchRepository: Repository<MaterialBatch>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly inventoryService: InventoryService,
    private readonly materialBatchService: MaterialBatchService,
    private readonly s3Service: S3Service,
  ) {}

  /** Upload file đính kèm lên S3, trả link — quyền OR (tạo HOẶC sửa nháp/_OWN), check ở đây. */
  async uploadFile(file: Express.Multer.File, currentUser: CurrentUserDto): Promise<string> {
    const context = `${ExportFormService.name}.${this.uploadFile.name}`;
    this.assertHasAny(currentUser, [
      AuthorityCode.ExportFormCreate,
      AuthorityCode.ExportFormUpdateDraft,
      AuthorityCode.ExportFormUpdateDraftOwn,
    ]);
    if (!file) throw new FileException(FileValidation.FILE_NOT_FOUND);
    if (!EXPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES.includes(file.mimetype))
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_FILE_TYPE_NOT_ALLOWED);

    const key = await this.s3Service.uploadFile(file, EXPORT_FORM_UPLOAD_FOLDER);
    this.logger.log(`Export form file uploaded: ${key}`, context);
    return this.s3Service.getFileUrl(key);
  }

  async createExportForm(
    warehouseSlug: string,
    dto: CreateExportFormRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ExportFormResponseDto> {
    const context = `${ExportFormService.name}.${this.createExportForm.name}`;
    const warehouse = await this.findWarehouse(warehouseSlug);
    if (!warehouse.isActive)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_WAREHOUSE_INACTIVE);

    const data = this.mapper.map(dto, CreateExportFormRequestDto, ExportForm);
    await this.assertCodeIsFree(data.code);
    const { items, total } = await this.buildItems(dto.items, warehouse.id);
    const requester = await this.findUser(currentUser.userId);

    const form = this.exportFormRepository.create({
      ...data,
      invoiceCode: data.invoiceCode ?? null,
      requester,
      requesterName: fullName(requester),
      approver: null,
      approverName: null,
      status: ExportFormStatus.Draft,
      warehouse,
      totalAmount: total,
    });
    // Đầu phiếu + dòng trong 1 transaction: lỗi ở dòng nào thì rollback cả phiếu.
    const created = await this.transactionManagerService.execute(async (manager) => {
      const saved = await manager.save(form);
      saved.items = await this.saveItems(manager, saved, items);
      return saved;
    });
    this.logger.log(`Export form created: ${created.id}`, context);
    return this.mapper.map(created, ExportForm, ExportFormResponseDto);
  }

  async findAll(
    warehouseSlug: string,
    query: GetAllExportFormRequestDto,
  ): Promise<AppPaginatedResponseDto<ExportFormResponseDto>> {
    await this.findWarehouse(warehouseSlug);

    const { start, end } = resolveDateRange(query.startDate, query.endDate);
    if (start && end && start >= end)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_DATE_RANGE_INVALID);

    const where: FindOptionsWhere<ExportForm> = { warehouse: { slug: warehouseSlug } };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.code) where.code = Like(`${escapeLike(query.code)}%`);
    if (query.invoiceCode) where.invoiceCode = Like(`${escapeLike(query.invoiceCode)}%`);
    if (query.purchaseOrder) where.purchaseOrder = Like(`${escapeLike(query.purchaseOrder)}%`);
    if (query.requesterSlug) where.requester = { slug: query.requesterSlug };
    if (query.approverSlug) where.approver = { slug: query.approverSlug };
    const createdAt = toDateRangeOperator(start, end);
    if (createdAt) where.createdAt = createdAt;

    const [items, total] = await this.exportFormRepository.findAndCount({
      where,
      relations: EXPORT_FORM_DETAIL_RELATIONS,
      order: {
        ...buildSortOrder<ExportForm, ExportFormSortBy>(query, { code: ['code'] }),
        items: { lineNo: 'ASC' },
      },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, ExportForm, ExportFormResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<ExportFormResponseDto>;
  }

  async findOne(warehouseSlug: string, slug: string): Promise<ExportFormResponseDto> {
    const form = await this.findForm(warehouseSlug, slug);
    return this.mapper.map(form, ExportForm, ExportFormResponseDto);
  }

  async updateExportForm(
    warehouseSlug: string,
    slug: string,
    dto: UpdateExportFormRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ExportFormResponseDto> {
    const form = await this.findForm(warehouseSlug, slug, dto.version);
    this.assertIsDraft(form);
    this.assertCanModify(
      form,
      currentUser,
      AuthorityCode.ExportFormUpdateDraft,
      AuthorityCode.ExportFormUpdateDraftOwn,
    );

    const data = pickDefined(this.mapper.map(dto, UpdateExportFormRequestDto, ExportForm));
    if (data.code !== undefined && data.code !== form.code) await this.assertCodeIsFree(data.code);
    const replacement =
      dto.items !== undefined && dto.items !== null
        ? await this.buildItems(dto.items, form.warehouse.id)
        : undefined;

    Object.assign(form, data);
    if (replacement) form.totalAmount = replacement.total;
    const oldItems = form.items ?? [];

    const updated = await this.transactionManagerService.execute(async (manager) => {
      form.items = undefined;
      const saved = await manager.save(form);
      if (!replacement) {
        saved.items = oldItems;
        return saved;
      }
      if (oldItems.length)
        await manager.delete(
          ExportFormItem,
          oldItems.map((item) => item.id),
        );
      saved.items = await this.saveItems(manager, saved, replacement.items);
      return saved;
    });
    return this.mapper.map(updated, ExportForm, ExportFormResponseDto);
  }

  async deleteExportForm(
    warehouseSlug: string,
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<number> {
    const context = `${ExportFormService.name}.${this.deleteExportForm.name}`;
    const form = await this.findForm(warehouseSlug, slug);
    this.assertIsDraft(form);
    this.assertCanModify(
      form,
      currentUser,
      AuthorityCode.ExportFormDeleteDraft,
      AuthorityCode.ExportFormDeleteDraftOwn,
    );

    await this.exportFormRepository.softRemove(form);
    this.logger.log(`Export form deleted: ${form.id}`, context);
    return 1;
  }

  confirmExportForm(
    warehouseSlug: string,
    slug: string,
    dto: ChangeExportFormStatusRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ExportFormResponseDto> {
    return this.decide(warehouseSlug, slug, dto, currentUser, ExportFormStatus.Confirmed);
  }

  cancelExportForm(
    warehouseSlug: string,
    slug: string,
    dto: ChangeExportFormStatusRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ExportFormResponseDto> {
    return this.decide(warehouseSlug, slug, dto, currentUser, ExportFormStatus.Cancelled);
  }

  /**
   * `DRAFT` → `CONFIRMED`/`CANCELLED`, người quyết định ghi vào `approver`. Xác nhận, trong 1
   * transaction: trừ lô (chỉ định / FEFO) → tách dòng theo lô → trừ tồn kho → đổi trạng thái.
   * Lỗi ở bất kỳ bước nào (thiếu lô, thiếu tồn) thì rollback hết. Huỷ không đụng tồn/lô — phiếu
   * nháp không giữ chỗ gì.
   */
  private async decide(
    warehouseSlug: string,
    slug: string,
    dto: ChangeExportFormStatusRequestDto,
    currentUser: CurrentUserDto,
    status: ExportFormStatus.Confirmed | ExportFormStatus.Cancelled,
  ): Promise<ExportFormResponseDto> {
    const context = `${ExportFormService.name}.${this.decide.name}`;
    const form = await this.findForm(warehouseSlug, slug, dto.version);
    this.assertIsDraft(form);
    // Xuất huỷ cần thêm quyền duyệt riêng — phụ thuộc dữ liệu phiếu nên guard không kiểm được.
    if (status === ExportFormStatus.Confirmed && form.type === ExportFormType.Disposal)
      this.assertHasAny(currentUser, [AuthorityCode.ExportFormApproveDisposal]);

    const approver = await this.findUser(currentUser.userId);
    const items = form.items ?? [];

    const updated = await this.transactionManagerService.execute(async (manager) => {
      // Khoá đầu phiếu rồi kiểm lại trạng thái + version trên bản ĐÃ KHOÁ (xem `ImportFormService`):
      // 2 request xác nhận đồng thời không được trừ tồn 2 lần.
      const locked = await manager.findOne(ExportForm, {
        where: { id: form.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new ExportFormException(ExportFormValidation.EXPORT_FORM_NOT_FOUND);
      this.assertIsDraft(locked);
      if (locked.version !== form.version)
        throw new OptimisticLockVersionMismatchError(ExportForm.name, form.version, locked.version);

      if (status === ExportFormStatus.Confirmed) {
        for (const item of items)
          // Vật tư bị xoá mềm sau khi ghi dòng ⇒ relation không load được.
          if (!item.material)
            throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_MATERIAL_NOT_FOUND);

        const allocations = await this.materialBatchService.consume(
          manager,
          form.warehouse.id,
          items.map((item) => ({
            key: item.id,
            materialId: item.material.id,
            baseQuantity: item.baseQuantity,
            batchId: item.batch?.id ?? null,
          })),
        );
        // Trừ tồn TRƯỚC khi tách dòng: tách dòng sửa `baseQuantity` của dòng gốc tại chỗ.
        await this.inventoryService.issue(
          manager,
          form.warehouse.id,
          items.map((item) => ({ materialId: item.material.id, quantity: item.baseQuantity })),
          currentUser,
          `Export form ${form.code}`,
        );
        form.items = await this.splitItemsByBatch(manager, form, items, allocations);
      }

      const responseItems = form.items;
      form.items = undefined;
      form.status = status;
      form.approver = approver;
      form.approverName = fullName(approver);
      const saved = await manager.save(form);
      saved.items = responseItems;
      return saved;
    });
    this.logger.log(`Export form ${form.id} -> ${status}`, context);
    return this.mapper.map(updated, ExportForm, ExportFormResponseDto);
  }

  /**
   * Gán lô cho từng dòng theo kết quả `consume`. Dòng lấy từ đúng 1 lô giữ nguyên, chỉ gán `batch`.
   * Dòng lấy từ N lô bị tách: phần đầu ghi đè lên dòng cũ, N-1 phần sau là dòng mới (cùng vật tư,
   * đơn vị, đơn giá, tỉ lệ). `quantity`/`amount` của từng phần tính theo lượng lấy; phần CUỐI nhận
   * phần dư để tổng số lượng và tổng tiền của dòng gốc giữ nguyên tuyệt đối (không lệch do làm
   * tròn). Cuối cùng đánh lại `lineNo` 1..n theo thứ tự cũ.
   */
  private async splitItemsByBatch(
    manager: EntityManager,
    form: ExportForm,
    items: ExportFormItem[],
    allocations: Map<string, BatchAllocation[]>,
  ): Promise<ExportFormItem[]> {
    const result: ExportFormItem[] = [];
    for (const item of [...items].sort((a, b) => a.lineNo - b.lineNo)) {
      const parts = allocations.get(item.id) ?? [];
      if (parts.length <= 1) {
        item.batch = parts[0]?.batch ?? item.batch ?? null;
        result.push(item);
        continue;
      }

      let quantityLeft = item.quantity;
      let amountLeft = item.amount;
      parts.forEach((part, index) => {
        const last = index === parts.length - 1;
        const quantity = last
          ? roundToScale(quantityLeft)
          : roundToScale(part.baseQuantity / item.conversionRate);
        const amount = last ? roundMoney(amountLeft) : roundMoney(quantity * item.unitPrice);
        quantityLeft = roundToScale(quantityLeft - quantity);
        amountLeft = roundMoney(amountLeft - amount);

        const piece = index === 0 ? item : new ExportFormItem();
        if (index > 0)
          Object.assign(piece, {
            exportForm: form,
            material: item.material,
            materialCode: item.materialCode,
            materialName: item.materialName,
            unit: item.unit,
            unitCode: item.unitCode,
            unitName: item.unitName,
            conversionRate: item.conversionRate,
            unitPrice: item.unitPrice,
            note: item.note ?? null,
          });
        Object.assign(piece, {
          quantity,
          baseQuantity: part.baseQuantity,
          amount,
          batch: part.batch,
        });
        result.push(piece);
      });
    }

    result.forEach((item, index) => {
      item.lineNo = index + 1;
      item.exportForm = form;
    });
    return manager.save(result);
  }

  /** `version` có mặt ⇒ optimistic lock, TypeORM tự ném `OptimisticLockVersionMismatchError`. */
  private async findForm(warehouseSlug: string, slug: string, version?: number) {
    const form = await this.exportFormRepository.findOne({
      where: { slug, warehouse: { slug: warehouseSlug } },
      relations: EXPORT_FORM_DETAIL_RELATIONS,
      order: { items: { lineNo: 'ASC' } },
      ...(version !== undefined && { lock: { mode: 'optimistic' as const, version } }),
    });
    if (!form) throw new ExportFormException(ExportFormValidation.EXPORT_FORM_NOT_FOUND);
    return form;
  }

  private saveItems(
    manager: EntityManager,
    form: ExportForm,
    items: ExportFormItem[],
  ): Promise<ExportFormItem[]> {
    items.forEach((item) => (item.exportForm = form));
    return manager.save(items);
  }

  /**
   * Dựng dòng phiếu từ body: resolve vật tư (1 query), kiểm đơn vị thuộc vật tư, vật tư đã gán vào
   * kho, lô chỉ định (nếu có) thuộc kho + vật tư và còn hàng; snapshot tỉ lệ + mã/tên; tính
   * `baseQuantity`/`amount` và `total`. KHÔNG kiểm đủ tồn/lô ở đây — phiếu nháp không giữ chỗ, việc
   * đó làm dưới khoá lúc xác nhận.
   */
  private async buildItems(
    dtos: CreateExportFormItemDto[],
    warehouseId: string,
  ): Promise<{ items: ExportFormItem[]; total: number }> {
    const seen = new Set<string>();
    for (const dto of dtos) {
      const key = `${dto.materialSlug}|${dto.unitSlug}|${dto.batchSlug ?? ''}`;
      if (seen.has(key))
        throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_DUPLICATED);
      seen.add(key);
    }

    const slugs = [...new Set(dtos.map((dto) => dto.materialSlug))];
    const materials = await this.materialRepository.find({
      where: { slug: In(slugs) },
      relations: { unitsCanHave: { unit: true } },
    });
    const materialBySlug = new Map(materials.map((material) => [material.slug, material]));
    const assigned = materials.length
      ? await this.inventoryRepository.find({
          where: {
            warehouse: { id: warehouseId },
            material: { id: In(materials.map((material) => material.id)) },
          },
          relations: { material: true },
        })
      : [];
    const assignedMaterialIds = new Set(assigned.map((row) => row.material.id));

    const batchSlugs = [...new Set(dtos.flatMap((dto) => (dto.batchSlug ? [dto.batchSlug] : [])))];
    const batches = batchSlugs.length
      ? await this.batchRepository.find({
          where: { slug: In(batchSlugs) },
          relations: { material: true, warehouse: true },
        })
      : [];
    const batchBySlug = new Map(batches.map((batch) => [batch.slug, batch]));

    let total = 0;
    const items = dtos.map((dto, index) => {
      const material = materialBySlug.get(dto.materialSlug);
      if (!material)
        throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_MATERIAL_NOT_FOUND);
      if (!assignedMaterialIds.has(material.id))
        throw new ExportFormException(
          ExportFormValidation.EXPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE,
        );
      const row = material.unitsCanHave?.find((mu) => mu.unit?.slug === dto.unitSlug);
      if (!row)
        throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL);

      const conversionRate = Number(row.conversionRate);
      if (!Number.isFinite(conversionRate) || conversionRate <= 0)
        throw new ExportFormException(
          ExportFormValidation.EXPORT_FORM_ITEM_CONVERSION_RATE_INVALID,
        );

      const batch = dto.batchSlug
        ? this.pickBatch(dto.batchSlug, batchBySlug, material, warehouseId)
        : null;

      const baseQuantity = roundToScale(dto.quantity * conversionRate);
      if (dto.quantity >= QUANTITY_MAX || baseQuantity >= QUANTITY_MAX || baseQuantity <= 0)
        throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_QUANTITY_INVALID);
      const amount = roundMoney(dto.quantity * dto.unitPrice);
      if (amount >= MONEY_MAX)
        throw new ExportFormException(ExportFormValidation.EXPORT_FORM_TOTAL_INVALID);
      total = roundMoney(total + amount);

      const item = new ExportFormItem();
      Object.assign(item, {
        lineNo: index + 1,
        material,
        materialCode: material.code,
        materialName: material.name,
        unit: row.unit,
        unitCode: row.unit.code,
        unitName: row.unit.name,
        batch,
        quantity: dto.quantity,
        conversionRate,
        baseQuantity,
        unitPrice: dto.unitPrice,
        amount,
        note: dto.note ?? null,
      });
      return item;
    });
    if (total >= MONEY_MAX)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_TOTAL_INVALID);

    return { items, total };
  }

  /** Lô của kho khác coi như không tồn tại (không lộ dữ liệu kho khác). */
  private pickBatch(
    slug: string,
    batchBySlug: Map<string, MaterialBatch>,
    material: Material,
    warehouseId: string,
  ): MaterialBatch {
    const batch = batchBySlug.get(slug);
    if (!batch || batch.warehouse?.id !== warehouseId)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_BATCH_NOT_FOUND);
    if (batch.material?.id !== material.id)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_BATCH_NOT_OF_MATERIAL);
    if (batch.status !== MaterialBatchStatus.InStock)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK);
    return batch;
  }

  private assertIsDraft(form: ExportForm): void {
    if (form.status !== ExportFormStatus.Draft)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_NOT_DRAFT);
  }

  /** Có ít nhất 1 trong `codes` (hoặc `SUPER_ADMIN`), không thì 403 như `AuthorityGuard`. */
  private assertHasAny(currentUser: CurrentUserDto, codes: TAuthorityCode[]): void {
    if (currentUser.roleName === RoleEnum.SuperAdmin) return;
    const scope = currentUser.scope ?? [];
    if (!codes.some((code) => scope.includes(code))) throw new ForbiddenException();
  }

  /** "Bản đầy đủ HOẶC bản `_OWN`" — xem `ImportFormService.assertCanModify`. */
  private assertCanModify(
    form: ExportForm,
    currentUser: CurrentUserDto,
    fullCode: TAuthorityCode,
    ownCode: TAuthorityCode,
  ): void {
    if (currentUser.roleName === RoleEnum.SuperAdmin) return;
    const scope = currentUser.scope ?? [];
    if (scope.includes(fullCode)) return;
    if (!scope.includes(ownCode)) throw new ForbiddenException();
    if (form.requester?.id !== currentUser.userId)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_NOT_OWNER);
  }

  /** UNIQUE `code` tính cả bản ghi xoá mềm ⇒ tra `withDeleted` để báo lỗi riêng. */
  private async assertCodeIsFree(code: string): Promise<void> {
    const existed = await this.exportFormRepository.findOne({
      where: { code },
      withDeleted: true,
    });
    if (!existed) return;
    throw new ExportFormException(
      existed.deletedAt
        ? ExportFormValidation.EXPORT_FORM_CODE_RESERVED_BY_DELETED_EXPORT_FORM
        : ExportFormValidation.EXPORT_FORM_CODE_DOES_EXIST,
    );
  }

  private async findWarehouse(slug: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    return warehouse;
  }

  private async findUser(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);
    return user;
  }
}
