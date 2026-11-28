import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { Item } from 'src/item/item.entity';
import { ITEM_ON_HAND_STATUSES } from 'src/item/item.constants';
import { ItemAllocation, ItemConsumeLine, ItemService } from 'src/item/item.service';
import { CodeGenerateService } from 'src/code-generate/code-generate.service';
import { CodeType } from 'src/code-generate/code-generate.constants';
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
import { User } from 'src/user/user.entity';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { findWarehouse } from 'src/warehouse/warehouse.util';
import { S3Service } from 'src/file/s3/s3.service';
import { FileException } from 'src/file/file.exception';
import { isAllowedUploadType } from 'src/file/file.util';
import { FileValidation } from 'src/file/file.validation';
import { toPaginatedResponse } from 'src/shared/utils/pagination.util';
import { MONEY_MAX, QUANTITY_MAX, roundMoney } from 'src/shared/utils/decimal.util';
import { fullName } from 'src/shared/utils/name.util';
import {
  assertFullOrOwnAuthority,
  assertHasAnyAuthority,
} from 'src/authority/authority-check.util';

const EXPORT_FORM_RELATIONS: FindOptionsRelations<ExportForm> = {
  requester: true,
  approver: true,
  warehouse: true,
};

/** Phiếu kèm dòng vật tư — dùng cho cả list và chi tiết. */
const EXPORT_FORM_DETAIL_RELATIONS: FindOptionsRelations<ExportForm> = {
  ...EXPORT_FORM_RELATIONS,
  items: { material: true, unit: true, item: true },
};

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
    @InjectRepository(Item) private readonly itemRepository: Repository<Item>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly codeGenerateService: CodeGenerateService,
    private readonly inventoryService: InventoryService,
    private readonly itemService: ItemService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Upload file đính kèm lên S3, trả link — quyền OR (tạo HOẶC sửa nháp/_OWN), check ở đây.
   * Kho phải tồn tại và đang hoạt động (cùng rào với `createExportForm`): `@WarehouseScope` không
   * chặn được vì `ADMIN`/`SUPER_ADMIN` bypass và guard không xét `isActive` — check trước khi đẩy
   * lên S3 để không sinh file mồ côi.
   */
  async uploadFile(
    warehouseSlug: string,
    file: Express.Multer.File,
    currentUser: CurrentUserDto,
  ): Promise<string> {
    const context = `${ExportFormService.name}.${this.uploadFile.name}`;
    assertHasAnyAuthority(currentUser, [
      AuthorityCode.ExportFormCreate,
      AuthorityCode.ExportFormUpdateDraft,
      AuthorityCode.ExportFormUpdateDraftOwn,
    ]);
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);
    if (!warehouse.isActive)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_WAREHOUSE_INACTIVE);
    if (!file) throw new FileException(FileValidation.FILE_NOT_FOUND);
    if (!isAllowedUploadType(file.originalname, file.mimetype))
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
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);
    if (!warehouse.isActive)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_WAREHOUSE_INACTIVE);

    const data = this.mapper.map(dto, CreateExportFormRequestDto, ExportForm);
    this.assertDisposalHasFile(data);
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
    // Đầu phiếu + dòng + giữ chỗ trong 1 transaction: thiếu lô/tồn ở dòng nào thì rollback cả phiếu.
    const created = await this.transactionManagerService.execute(async (manager) => {
      // Sinh mã ngay trước khi lưu: `FOR UPDATE` trên bộ đếm giữ tới khi transaction kết thúc.
      form.code = await this.codeGenerateService.generate(manager, CodeType.ExportForm, warehouse);
      const saved = await manager.save(form);
      const savedItems = await this.saveItems(manager, saved, items);
      saved.items = await this.reserveItems(
        manager,
        saved,
        savedItems,
        currentUser,
        `Export form ${saved.code} drafted`,
      );
      return saved;
    });
    this.logger.log(`Export form created: ${created.id}`, context);
    return this.mapper.map(created, ExportForm, ExportFormResponseDto);
  }

  async findAll(
    warehouseSlug: string,
    query: GetAllExportFormRequestDto,
  ): Promise<AppPaginatedResponseDto<ExportFormResponseDto>> {
    await findWarehouse(this.warehouseRepository, warehouseSlug);

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

    return toPaginatedResponse(
      this.mapper.mapArray(items, ExportForm, ExportFormResponseDto),
      total,
      query,
    );
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
    this.assertDisposalHasFile({
      type: data.type ?? form.type,
      file: data.file !== undefined ? data.file : form.file,
    });
    const replacement =
      dto.items !== undefined && dto.items !== null
        ? await this.buildItems(dto.items, form.warehouse.id)
        : undefined;

    Object.assign(form, data);
    if (replacement) form.totalAmount = replacement.total;
    const oldItems = form.items ?? [];

    const updated = await this.transactionManagerService.execute(async (manager) => {
      await this.lockForm(manager, form, [ExportFormStatus.Draft], 'EXPORT_FORM_NOT_DRAFT');
      // Thay dòng: trả chỗ của dòng cũ TRƯỚC rồi mới giữ cho dòng mới — dòng mới được lấy lại đúng
      // phần mà dòng cũ vừa nhả (cùng lô, cùng tồn).
      if (replacement)
        await this.releaseItems(
          manager,
          form,
          this.assertItemsHaveMaterial(form),
          currentUser,
          `Export form ${form.code} lines replaced`,
        );
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
      const savedItems = await this.saveItems(manager, saved, replacement.items);
      saved.items = await this.reserveItems(
        manager,
        saved,
        savedItems,
        currentUser,
        `Export form ${saved.code} lines replaced`,
      );
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

    const items = this.assertItemsHaveMaterial(form);
    await this.transactionManagerService.execute(async (manager) => {
      await this.lockForm(manager, form, [ExportFormStatus.Draft], 'EXPORT_FORM_NOT_DRAFT');
      await this.releaseItems(
        manager,
        form,
        items,
        currentUser,
        `Export form ${form.code} deleted`,
      );
      await manager.softRemove(form);
    });
    this.logger.log(`Export form deleted: ${form.id}`, context);
    return 1;
  }

  /**
   * `DRAFT` → `PENDING`: khoá phiếu rồi đổi trạng thái. Lô/tồn đã giữ chỗ từ lúc hàng vào phiếu nháp
   * nên không đụng lại. Quyền như sửa nháp (bản đầy đủ HOẶC `_OWN`) — gửi duyệt là việc của người lập.
   */
  async submitExportForm(
    warehouseSlug: string,
    slug: string,
    dto: ChangeExportFormStatusRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ExportFormResponseDto> {
    const context = `${ExportFormService.name}.${this.submitExportForm.name}`;
    const form = await this.findForm(warehouseSlug, slug, dto.version);
    this.assertIsDraft(form);
    this.assertCanModify(
      form,
      currentUser,
      AuthorityCode.ExportFormUpdateDraft,
      AuthorityCode.ExportFormUpdateDraftOwn,
    );
    this.assertDisposalHasFile(form);
    const items = this.assertItemsHaveMaterial(form);

    const updated = await this.transactionManagerService.execute(async (manager) => {
      await this.lockForm(manager, form, [ExportFormStatus.Draft], 'EXPORT_FORM_NOT_DRAFT');
      form.items = undefined;
      form.status = ExportFormStatus.Pending;
      const saved = await manager.save(form);
      saved.items = items;
      return saved;
    });
    this.logger.log(`Export form ${form.id} -> ${ExportFormStatus.Pending}`, context);
    return this.mapper.map(updated, ExportForm, ExportFormResponseDto);
  }

  /**
   * `PENDING` → `CONFIRMED`, 1 transaction: trừ đúng các lô đã giữ chỗ (cả `remaining` lẫn
   * `reserved`; lô hết hàng ⇒ `ISSUED`/`DISPOSED`/`IN_TRANSIT` theo `type`) → trừ tồn kho kèm phần
   * giữ chỗ (lịch sử `EXPORT`). Không chọn lại lô, không tách dòng — việc đó xong lúc vào phiếu nháp.
   */
  async confirmExportForm(
    warehouseSlug: string,
    slug: string,
    dto: ChangeExportFormStatusRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ExportFormResponseDto> {
    const context = `${ExportFormService.name}.${this.confirmExportForm.name}`;
    const form = await this.findForm(warehouseSlug, slug, dto.version);
    if (form.status !== ExportFormStatus.Pending)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_NOT_PENDING);
    // Xuất huỷ cần thêm quyền duyệt riêng — phụ thuộc dữ liệu phiếu nên guard không kiểm được.
    if (form.type === ExportFormType.Disposal)
      assertHasAnyAuthority(currentUser, [AuthorityCode.ExportFormApproveDisposal]);
    this.assertDisposalHasFile(form);
    const items = this.assertItemsHaveMaterial(form);
    const approver = await this.findUser(currentUser.userId);

    const updated = await this.transactionManagerService.execute(async (manager) => {
      await this.lockForm(manager, form, [ExportFormStatus.Pending], 'EXPORT_FORM_NOT_PENDING');
      await this.itemService.consumeReserved(
        manager,
        form.warehouse.id,
        this.toItemLines(items),
        form.type,
      );
      await this.inventoryService.issue(
        manager,
        form.warehouse.id,
        this.toInventoryLines(items),
        currentUser,
        `Export form ${form.code}`,
        { fromReserved: true },
      );
      return this.saveDecision(manager, form, ExportFormStatus.Confirmed, approver);
    });
    this.logger.log(`Export form ${form.id} -> ${ExportFormStatus.Confirmed}`, context);
    return this.mapper.map(updated, ExportForm, ExportFormResponseDto);
  }

  /**
   * `DRAFT`/`PENDING` → `CANCELLED`: trả lại phần đã giữ trên lô và tồn kho (lịch sử `RELEASE`)
   * trong cùng transaction — cả nháp lẫn `PENDING` đều đang giữ chỗ.
   */
  async cancelExportForm(
    warehouseSlug: string,
    slug: string,
    dto: ChangeExportFormStatusRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ExportFormResponseDto> {
    const context = `${ExportFormService.name}.${this.cancelExportForm.name}`;
    const form = await this.findForm(warehouseSlug, slug, dto.version);
    const cancellable = [ExportFormStatus.Draft, ExportFormStatus.Pending];
    if (!cancellable.includes(form.status))
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_CANNOT_BE_CANCELLED);
    const approver = await this.findUser(currentUser.userId);

    const updated = await this.transactionManagerService.execute(async (manager) => {
      await this.lockForm(manager, form, [form.status], 'EXPORT_FORM_CANNOT_BE_CANCELLED');
      await this.releaseItems(
        manager,
        form,
        this.assertItemsHaveMaterial(form),
        currentUser,
        `Export form ${form.code} cancelled`,
      );
      return this.saveDecision(manager, form, ExportFormStatus.Cancelled, approver);
    });
    this.logger.log(`Export form ${form.id} -> ${ExportFormStatus.Cancelled}`, context);
    return this.mapper.map(updated, ExportForm, ExportFormResponseDto);
  }

  /**
   * Khoá đầu phiếu rồi kiểm lại trạng thái + version trên bản ĐÃ KHOÁ (xem `ImportFormService`):
   * 2 request đồng thời không được giữ chỗ / trừ tồn 2 lần.
   */
  private async lockForm(
    manager: EntityManager,
    form: ExportForm,
    expected: ExportFormStatus[],
    error: keyof typeof ExportFormValidation,
  ): Promise<void> {
    const locked = await manager.findOne(ExportForm, {
      where: { id: form.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) throw new ExportFormException(ExportFormValidation.EXPORT_FORM_NOT_FOUND);
    if (!expected.includes(locked.status))
      throw new ExportFormException(ExportFormValidation[error]);
    if (locked.version !== form.version)
      throw new OptimisticLockVersionMismatchError(ExportForm.name, form.version, locked.version);
  }

  private async saveDecision(
    manager: EntityManager,
    form: ExportForm,
    status: ExportFormStatus.Confirmed | ExportFormStatus.Cancelled,
    approver: User,
  ): Promise<ExportForm> {
    const responseItems = form.items;
    form.items = undefined;
    form.status = status;
    form.approver = approver;
    form.approverName = fullName(approver);
    const saved = await manager.save(form);
    saved.items = responseItems;
    return saved;
  }

  /** Vật tư bị xoá mềm sau khi ghi dòng ⇒ relation không load được. */
  private assertItemsHaveMaterial(form: ExportForm): ExportFormItem[] {
    const items = form.items ?? [];
    for (const item of items)
      if (!item.material)
        throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_MATERIAL_NOT_FOUND);
    return items;
  }

  /**
   * Giữ chỗ cho dòng ĐÃ LƯU (có `id`): giữ trên lô (chỉ định / FEFO trên phần còn trống, lô ⇒
   * `RESERVED` khi hết phần trống) → giữ tồn kho (lịch sử `RESERVE`) → tách dòng theo lô. Thiếu
   * lô/tồn ⇒ throw, caller rollback cả transaction.
   */
  private async reserveItems(
    manager: EntityManager,
    form: ExportForm,
    items: ExportFormItem[],
    currentUser: CurrentUserDto,
    note: string,
  ): Promise<ExportFormItem[]> {
    const allocations = await this.itemService.reserve(
      manager,
      form.warehouse.id,
      this.toItemLines(items),
    );
    // Giữ chỗ tồn TRƯỚC khi tách dòng: tách dòng sửa `baseQuantity` của dòng gốc tại chỗ.
    await this.inventoryService.reserve(
      manager,
      form.warehouse.id,
      this.toInventoryLines(items),
      currentUser,
      note,
    );
    return this.splitLinesByItem(manager, form, items, allocations);
  }

  /** Trả lại phần dòng phiếu đang giữ trên lô và tồn kho (lịch sử `RELEASE`). */
  private async releaseItems(
    manager: EntityManager,
    form: ExportForm,
    items: ExportFormItem[],
    currentUser: CurrentUserDto,
    note: string,
  ): Promise<void> {
    if (!items.length) return;
    await this.itemService.release(manager, form.warehouse.id, this.toItemLines(items));
    await this.inventoryService.release(
      manager,
      form.warehouse.id,
      this.toInventoryLines(items),
      currentUser,
      note,
    );
  }

  private toItemLines(items: ExportFormItem[]): ItemConsumeLine[] {
    return items.map((item) => ({
      key: item.id,
      materialId: item.material.id,
      baseQuantity: item.baseQuantity,
      itemId: item.item?.id ?? null,
    }));
  }

  private toInventoryLines(items: ExportFormItem[]) {
    return items.map((item) => ({ materialId: item.material.id, quantity: item.baseQuantity }));
  }

  /**
   * Gán lô cho từng dòng theo kết quả `reserve`. Dòng lấy từ đúng 1 lô giữ nguyên, chỉ gán `batch`.
   * Dòng lấy từ N lô bị tách: phần đầu ghi đè lên dòng cũ, N-1 phần sau là dòng mới (cùng vật tư,
   * đơn vị, đơn giá, tỉ lệ). `quantity`/`amount` của từng phần tính theo lượng lấy; phần CUỐI nhận
   * phần dư để tổng số lượng và tổng tiền của dòng gốc giữ nguyên tuyệt đối (không lệch do làm
   * tròn). Cuối cùng đánh lại `lineNo` 1..n theo thứ tự cũ.
   */
  private async splitLinesByItem(
    manager: EntityManager,
    form: ExportForm,
    items: ExportFormItem[],
    allocations: Map<string, ItemAllocation[]>,
  ): Promise<ExportFormItem[]> {
    const result: ExportFormItem[] = [];
    for (const item of [...items].sort((a, b) => a.lineNo - b.lineNo)) {
      const parts = allocations.get(item.id) ?? [];
      if (parts.length <= 1) {
        item.item = parts[0]?.item ?? item.item ?? null;
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
          item: part.item,
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
   * `baseQuantity`/`amount` và `total`. KHÔNG kiểm đủ tồn/lô ở đây — việc đó làm dưới khoá lúc giữ
   * chỗ (`reserveItems`) trong transaction ghi dòng.
   */
  private async buildItems(
    dtos: CreateExportFormItemDto[],
    warehouseId: string,
  ): Promise<{ items: ExportFormItem[]; total: number }> {
    const seen = new Set<string>();
    for (const dto of dtos) {
      const key = `${dto.materialSlug}|${dto.unitSlug}|${dto.itemSlug ?? ''}`;
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

    const itemSlugs = [...new Set(dtos.flatMap((dto) => (dto.itemSlug ? [dto.itemSlug] : [])))];
    const stockItems = itemSlugs.length
      ? await this.itemRepository.find({
          where: { slug: In(itemSlugs) },
          relations: { material: true, warehouse: true },
        })
      : [];
    const itemBySlug = new Map(stockItems.map((stockItem) => [stockItem.slug, stockItem]));

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

      const stockItem = dto.itemSlug
        ? this.pickItem(dto.itemSlug, itemBySlug, material, warehouseId)
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
        item: stockItem,
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

  /**
   * Lô của kho khác coi như không tồn tại (không lộ dữ liệu kho khác). Lô `RESERVED` vẫn chọn được:
   * PATCH dòng nhả chỗ của chính phiếu này trước khi giữ lại; đủ phần trống hay không do `reserve`
   * quyết dưới khoá.
   */
  private pickItem(
    slug: string,
    itemBySlug: Map<string, Item>,
    material: Material,
    warehouseId: string,
  ): Item {
    const stockItem = itemBySlug.get(slug);
    if (!stockItem || stockItem.warehouse?.id !== warehouseId)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_BATCH_NOT_FOUND);
    if (stockItem.material?.id !== material.id)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_BATCH_NOT_OF_MATERIAL);
    if (!ITEM_ON_HAND_STATUSES.includes(stockItem.status))
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK);
    return stockItem;
  }

  private assertIsDraft(form: ExportForm): void {
    if (form.status !== ExportFormStatus.Draft)
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_NOT_DRAFT);
  }

  /** Phiếu xuất huỷ (`DISPOSAL`) bắt buộc phải có chứng từ đính kèm (`file`). */
  private assertDisposalHasFile(form: Pick<ExportForm, 'type' | 'file'>): void {
    if (form.type === ExportFormType.Disposal && !form.file?.trim()) {
      throw new ExportFormException(ExportFormValidation.EXPORT_FORM_FILE_IS_REQUIRED);
    }
  }

  /** "Bản đầy đủ HOẶC bản `_OWN`" — xem `ImportFormService.assertCanModify`. */
  private assertCanModify(
    form: ExportForm,
    currentUser: CurrentUserDto,
    fullCode: TAuthorityCode,
    ownCode: TAuthorityCode,
  ): void {
    assertFullOrOwnAuthority(
      currentUser,
      fullCode,
      ownCode,
      form.requester?.id,
      () => new ExportFormException(ExportFormValidation.EXPORT_FORM_NOT_OWNER),
    );
  }

  private async findUser(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);
    return user;
  }
}
