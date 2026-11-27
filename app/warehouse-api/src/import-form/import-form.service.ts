import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EntityManager,
  Equal,
  FindOptionsRelations,
  FindOptionsWhere,
  Like,
  OptimisticLockVersionMismatchError,
  Repository,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  AddImportFormItemRequestDto,
  AddImportFormItemResponseDto,
  ChangeImportFormStatusRequestDto,
  CreateImportFormRequestDto,
  GetAllImportFormRequestDto,
  GetImportFormAvailableMaterialRequestDto,
  ImportFormAvailableMaterialResponseDto,
  ImportFormResponseDto,
  UpdateImportFormRequestDto,
  ImportFormSortBy,
} from './import-form.dto';
import { ImportForm } from './import-form.entity';
import { ImportFormItem } from './import-form-item.entity';
import {
  IMPORT_FORM_ITEMS_MAX,
  IMPORT_FORM_UPLOAD_FOLDER,
  ImportFormStatus,
} from './import-form.constants';
import { ImportFormException } from './import-form.exception';
import { ImportFormValidation } from './import-form.validation';
import { pickDefined } from 'src/shared/utils/obj.util';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { Material } from 'src/material/material.entity';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierException } from 'src/supplier/supplier.exception';
import { SupplierValidation } from 'src/supplier/supplier.validation';
import { insertMaterialSuppliers } from 'src/material/material-supplier.util';
import { CodeGenerateService } from 'src/code-generate/code-generate.service';
import { CodeType } from 'src/code-generate/code-generate.constants';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { Inventory } from 'src/inventory/inventory.entity';
import { effectiveMaximum } from 'src/inventory/inventory.util';
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
import { MaterialBatchService } from 'src/material-batch/material-batch.service';
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

/** Response cần slug của người lập/người duyệt/kho — các cột snapshot còn lại nằm sẵn trên phiếu. */
const IMPORT_FORM_RELATIONS: FindOptionsRelations<ImportForm> = {
  requester: true,
  approver: true,
  warehouse: true,
};

/**
 * Chi tiết 1 phiếu kèm dòng vật tư (list cố ý KHÔNG load `items`). PATCH cũng cần `items` đã load
 * để biết id dòng cũ cần xoá khi thay dòng.
 */
const IMPORT_FORM_DETAIL_RELATIONS: FindOptionsRelations<ImportForm> = {
  ...IMPORT_FORM_RELATIONS,
  items: { material: true, unit: true },
};

/** Cặp (vật tư, nhà cung cấp) chưa gắn, cần ghi vào `material_supplier_tbl` cùng transaction phiếu. */
type MaterialSupplierLink = { materialId: string; supplierId: string };

/**
 * Mọi thao tác đều khoá theo kho ở route: tra phiếu luôn kèm `warehouse.slug`, nên member của kho A
 * không đọc/sửa được phiếu kho B bằng cách gắn slug phiếu B vào URL của kho A (`WarehouseScopeGuard`
 * chỉ kiểm user có thuộc kho A hay không).
 */
@Injectable()
export class ImportFormService {
  constructor(
    @InjectRepository(ImportForm) private readonly importFormRepository: Repository<ImportForm>,
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Material) private readonly materialRepository: Repository<Material>,
    @InjectRepository(Supplier) private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Inventory) private readonly inventoryRepository: Repository<Inventory>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly transactionManagerService: TransactionManagerService,
    private readonly codeGenerateService: CodeGenerateService,
    private readonly inventoryService: InventoryService,
    private readonly s3Service: S3Service,
    private readonly materialBatchService: MaterialBatchService,
  ) {}

  /**
   * Upload file đính kèm phiếu lên S3, trả link. Không gắn vào phiếu nào: client gửi link này vào
   * field `file` của `POST`/`PATCH` phiếu, 2 route đó chỉ lưu chuỗi.
   *
   * Quyền là OR (tạo phiếu HOẶC sửa phiếu nháp, kể cả bản `_OWN`) ⇒ check ở đây, không bằng decorator.
   * Không có phiếu cụ thể nên `_OWN` không cần so người tạo — rào đó nằm ở `PATCH`.
   */
  async uploadFile(file: Express.Multer.File, currentUser: CurrentUserDto): Promise<string> {
    const context = `${ImportFormService.name}.${this.uploadFile.name}`;
    assertHasAnyAuthority(currentUser, [
      AuthorityCode.ImportFormCreate,
      AuthorityCode.ImportFormUpdateDraft,
      AuthorityCode.ImportFormUpdateDraftOwn,
    ]);
    if (!file) throw new FileException(FileValidation.FILE_NOT_FOUND);
    if (!isAllowedUploadType(file.originalname, file.mimetype))
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_FILE_TYPE_NOT_ALLOWED);

    const key = await this.s3Service.uploadFile(file, IMPORT_FORM_UPLOAD_FOLDER);
    this.logger.log(`Import form file uploaded: ${key}`, context);
    return this.s3Service.getFileUrl(key);
  }

  async createImportForm(
    warehouseSlug: string,
    dto: CreateImportFormRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ImportFormResponseDto> {
    const context = `${ImportFormService.name}.${this.createImportForm.name}`;
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);
    if (!warehouse.isActive)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_WAREHOUSE_INACTIVE);

    const data = this.mapper.map(dto, CreateImportFormRequestDto, ImportForm);
    const requester = await this.findUser(currentUser.userId);

    const form = this.importFormRepository.create({
      ...data,
      requester,
      requesterName: fullName(requester),
      approver: null,
      approverName: null,
      status: ImportFormStatus.Draft,
      warehouse,
      total: 0,
    });
    // Phiếu nháp rỗng — hàng thêm sau qua `addItems`. Transaction vì bộ đếm mã cần `FOR UPDATE`.
    const created = await this.transactionManagerService.execute(async (manager) => {
      // Sinh mã ngay trước khi lưu: `FOR UPDATE` trên bộ đếm giữ tới khi transaction kết thúc.
      form.code = await this.codeGenerateService.generate(manager, CodeType.ImportForm, warehouse);
      const saved = await manager.save(form);
      saved.items = [];
      return saved;
    });
    this.logger.log(`Import form created: ${created.id}`, context);
    return this.mapper.map(created, ImportForm, ImportFormResponseDto);
  }

  async findAll(
    warehouseSlug: string,
    query: GetAllImportFormRequestDto,
  ): Promise<AppPaginatedResponseDto<ImportFormResponseDto>> {
    // `SUPER_ADMIN`/`ADMIN` bypass `WarehouseScopeGuard` (không tra DB) ⇒ kho không tồn tại phải
    // báo 404 ở đây, không trả về danh sách rỗng.
    await findWarehouse(this.warehouseRepository, warehouseSlug);

    const { start, end } = resolveDateRange(query.startDate, query.endDate);
    if (start && end && start >= end)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_DATE_RANGE_INVALID);

    const where: FindOptionsWhere<ImportForm> = { warehouse: { slug: warehouseSlug } };
    if (query.status) where.status = query.status;
    // Tìm theo tiền tố (`LIKE 'x%'`) — dùng được index UNIQUE của `code_column`.
    if (query.code) where.code = Like(`${escapeLike(query.code)}%`);
    if (query.invoiceCode) where.invoiceCode = Like(`${escapeLike(query.invoiceCode)}%`);
    if (query.purchaseOrder) where.purchaseOrder = Like(`${escapeLike(query.purchaseOrder)}%`);
    if (query.requesterSlug) where.requester = { slug: query.requesterSlug };
    if (query.approverSlug) where.approver = { slug: query.approverSlug };
    const createdAt = toDateRangeOperator(start, end);
    if (createdAt) where.createdAt = createdAt;

    const [items, total] = await this.importFormRepository.findAndCount({
      where,
      relations: IMPORT_FORM_RELATIONS,
      order: buildSortOrder<ImportForm, ImportFormSortBy>(query, { code: ['code'] }),
      skip: (query.page - 1) * query.size,
      take: query.size,
    });

    return toPaginatedResponse(
      this.mapper.mapArray(items, ImportForm, ImportFormResponseDto),
      total,
      query,
    );
  }

  /**
   * Vật tư ghi được vào phiếu nhập của kho = vật tư đã gán vào kho (có dòng `inventory_tbl`), kèm
   * các đơn vị đã gắn để client chọn `unitSlug`. Cùng nguồn với rào trong `buildLines`.
   */
  async findAvailableMaterials(
    warehouseSlug: string,
    query: GetImportFormAvailableMaterialRequestDto,
  ): Promise<AppPaginatedResponseDto<ImportFormAvailableMaterialResponseDto>> {
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);

    const materialWhere: FindOptionsWhere<Material> = {};
    if (query.code) materialWhere.code = Like(`${escapeLike(query.code)}%`);
    if (query.name) materialWhere.name = Like(`%${escapeLike(query.name)}%`);

    const [rows, total] = await this.inventoryRepository.findAndCount({
      where: { warehouse: { id: warehouse.id }, material: materialWhere },
      relations: { material: { baseUnit: true, suppliers: true, unitsCanHave: { unit: true } } },
      order: { material: { code: 'ASC' } },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });

    return toPaginatedResponse(
      rows.map((row) => {
        const { material, quantity } = row;
        const max = effectiveMaximum(row);
        return {
          slug: material.slug,
          code: material.code,
          name: material.name,
          baseUnitSlug: material.baseUnit?.slug ?? null,
          quantity,
          ...(max !== null ? { effectiveMaximumInventory: max } : {}),
          suppliers: (material.suppliers ?? [])
            .map(({ slug, code, name }) => ({ slug, code, name }))
            .sort((a, b) => a.code.localeCompare(b.code)),
          units: (material.unitsCanHave ?? [])
            .map((mu) => ({
              unitSlug: mu.unit.slug,
              unitCode: mu.unit.code,
              unitName: mu.unit.name,
              conversionRate: Number(mu.conversionRate),
              isBaseUnit: mu.unitId === material.baseUnit?.id,
            }))
            .sort((a, b) => a.conversionRate - b.conversionRate),
        };
      }),
      total,
      query,
    );
  }

  async findOne(warehouseSlug: string, slug: string): Promise<ImportFormResponseDto> {
    const form = await this.findForm(warehouseSlug, slug);
    return this.mapper.map(form, ImportForm, ImportFormResponseDto);
  }

  async updateImportForm(
    warehouseSlug: string,
    slug: string,
    dto: UpdateImportFormRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ImportFormResponseDto> {
    const form = await this.findForm(warehouseSlug, slug, dto.version);
    this.assertIsDraft(form);
    this.assertCanModify(
      form,
      currentUser,
      AuthorityCode.ImportFormUpdateDraft,
      AuthorityCode.ImportFormUpdateDraftOwn,
    );

    // PATCH partial: xem `pickDefined` — field không gửi giữ nguyên giá trị cũ. Dòng không sửa ở đây.
    const data = pickDefined(this.mapper.map(dto, UpdateImportFormRequestDto, ImportForm));
    // Đổi ngày phiếu: hạn dùng của dòng đã có vẫn không được trước ngày nhập mới.
    const formDate = data.date ?? form.date;
    (form.items ?? []).forEach((item) => this.assertExpiry(item.expiryDate, formDate));

    await this.transactionManagerService.execute(async (manager) => {
      // Ghi lên bản ĐÃ KHOÁ (không phải `form` đọc trước đó): `total` có thể vừa đổi bởi
      // `addItems`/`removeItem` — chúng luôn tăng `version` nên version khớp ⇒ dòng chưa đổi.
      const locked = await this.lockDraft(manager, form.id);
      if (locked.version !== form.version)
        throw new OptimisticLockVersionMismatchError(ImportForm.name, form.version, locked.version);
      Object.assign(locked, data);
      await manager.save(locked);
    });
    return this.findOne(warehouseSlug, slug);
  }

  /**
   * Thêm hàng vào phiếu nháp (quét barcode hoặc chọn tay): `quantity` đơn vị ⇒ `quantity` dòng, mỗi
   * dòng 1 mã `CodeType.Item` (`{prefix}-{mã kho}-{yymmdd}-{seq}`). Quyền như sửa phiếu nháp.
   *
   * Không nhận `version`: các lần quét liên tiếp không phải mang version mới nhất. Chống ghi chồng
   * bằng `FOR UPDATE` đầu phiếu (cùng khoá với xác nhận/huỷ ⇒ không thêm dòng vào phiếu đang được
   * xác nhận). Lưu lại đầu phiếu ⇒ `version` tăng, nên ai giữ version cũ (xác nhận/PATCH) bị 409 —
   * không xác nhận nhầm phiếu đã có thêm hàng sau lần đọc.
   */
  async addItems(
    warehouseSlug: string,
    slug: string,
    dto: AddImportFormItemRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<AddImportFormItemResponseDto> {
    const context = `${ImportFormService.name}.${this.addItems.name}`;
    const form = await this.findForm(warehouseSlug, slug);
    this.assertIsDraft(form);
    this.assertCanModify(
      form,
      currentUser,
      AuthorityCode.ImportFormUpdateDraft,
      AuthorityCode.ImportFormUpdateDraftOwn,
    );
    // Dựng + kiểm tra TRƯỚC khi mở transaction để lỗi nghiệp vụ không chạm DB.
    const { lines, supplierLinks } = await this.buildLines(dto, form.warehouse.id, form.date);

    const codes = await this.transactionManagerService.execute(async (manager) => {
      const locked = await this.lockDraft(manager, form.id);
      const count = await manager.count(ImportFormItem, {
        where: { importForm: Equal(locked.id) },
      });
      if (count + lines.length > IMPORT_FORM_ITEMS_MAX)
        throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEMS_TOO_MANY);
      const total = lines.reduce((sum, line) => roundMoney(sum + line.amount), locked.total);
      if (total >= MONEY_MAX)
        throw new ImportFormException(ImportFormValidation.IMPORT_FORM_TOTAL_INVALID);

      await insertMaterialSuppliers(manager, supplierLinks);
      const lastLineNo = await this.lastLineNo(manager, locked.id);
      // Sinh mã ngay trước khi lưu: `FOR UPDATE` trên bộ đếm giữ tới khi transaction kết thúc.
      const generated = await this.codeGenerateService.generateMany(
        manager,
        CodeType.Item,
        form.warehouse,
        lines.length,
      );
      lines.forEach((line, index) => {
        line.importForm = locked;
        line.lineNo = lastLineNo + index + 1;
        line.code = generated[index];
      });
      await manager.save(lines);
      await this.saveTotal(manager, locked, total);
      return generated;
    });
    this.logger.log(`Added ${codes.length} item(s) to import form ${form.id}`, context);
    return { codes, form: await this.findOne(warehouseSlug, slug) };
  }

  /** Gỡ 1 dòng (1 đơn vị hàng) khỏi phiếu nháp. Mã của dòng đã cấp không cấp lại. */
  async removeItem(
    warehouseSlug: string,
    slug: string,
    itemSlug: string,
    currentUser: CurrentUserDto,
  ): Promise<ImportFormResponseDto> {
    const context = `${ImportFormService.name}.${this.removeItem.name}`;
    const form = await this.findForm(warehouseSlug, slug);
    this.assertIsDraft(form);
    this.assertCanModify(
      form,
      currentUser,
      AuthorityCode.ImportFormUpdateDraft,
      AuthorityCode.ImportFormUpdateDraftOwn,
    );

    await this.transactionManagerService.execute(async (manager) => {
      const locked = await this.lockDraft(manager, form.id);
      // Tra lại dưới khoá: dòng đọc ở `findForm` có thể đã bị request khác gỡ.
      const item = await manager.findOne(ImportFormItem, {
        where: { slug: itemSlug, importForm: Equal(locked.id) },
      });
      if (!item) throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_NOT_FOUND);
      await manager.delete(ImportFormItem, item.id);
      await this.saveTotal(manager, locked, Math.max(0, roundMoney(locked.total - item.amount)));
    });
    this.logger.log(`Removed item ${itemSlug} from import form ${form.id}`, context);
    return this.findOne(warehouseSlug, slug);
  }

  async deleteImportForm(
    warehouseSlug: string,
    slug: string,
    currentUser: CurrentUserDto,
  ): Promise<number> {
    const context = `${ImportFormService.name}.${this.deleteImportForm.name}`;
    const form = await this.findForm(warehouseSlug, slug);
    this.assertIsDraft(form);
    this.assertCanModify(
      form,
      currentUser,
      AuthorityCode.ImportFormDeleteDraft,
      AuthorityCode.ImportFormDeleteDraftOwn,
    );

    await this.importFormRepository.softRemove(form);
    this.logger.log(`Import form deleted: ${form.id}`, context);
    return 1;
  }

  confirmImportForm(
    warehouseSlug: string,
    slug: string,
    dto: ChangeImportFormStatusRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ImportFormResponseDto> {
    return this.decide(warehouseSlug, slug, dto, currentUser, ImportFormStatus.Confirmed);
  }

  cancelImportForm(
    warehouseSlug: string,
    slug: string,
    dto: ChangeImportFormStatusRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ImportFormResponseDto> {
    return this.decide(warehouseSlug, slug, dto, currentUser, ImportFormStatus.Cancelled);
  }

  /**
   * `DRAFT` → `CONFIRMED`/`CANCELLED`, người quyết định được ghi làm `approver`. Xác nhận = cộng
   * `baseQuantity` của mọi dòng vào tồn của kho, cùng transaction với đổi trạng thái; huỷ không đụng
   * tồn (phiếu nháp chưa cộng gì).
   */
  private async decide(
    warehouseSlug: string,
    slug: string,
    dto: ChangeImportFormStatusRequestDto,
    currentUser: CurrentUserDto,
    status: ImportFormStatus.Confirmed | ImportFormStatus.Cancelled,
  ): Promise<ImportFormResponseDto> {
    const context = `${ImportFormService.name}.${this.decide.name}`;
    const form = await this.findForm(warehouseSlug, slug, dto.version);
    this.assertIsDraft(form);

    const items = form.items ?? [];
    if (status === ImportFormStatus.Confirmed && !items.length)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEMS_IS_REQUIRED);
    const approver = await this.findUser(currentUser.userId);

    const updated = await this.transactionManagerService.execute(async (manager) => {
      // Khoá đầu phiếu rồi kiểm lại trạng thái + version trên bản ĐÃ KHOÁ: optimistic check ở
      // `findForm` chỉ chạy lúc đọc, `save()` không kèm `WHERE version` — 2 request xác nhận đồng
      // thời đều qua được check đó và cộng tồn 2 lần. Version khớp ⇒ dòng phiếu chưa bị PATCH thay.
      const locked = await manager.findOne(ImportForm, {
        where: { id: form.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new ImportFormException(ImportFormValidation.IMPORT_FORM_NOT_FOUND);
      this.assertIsDraft(locked);
      if (locked.version !== form.version)
        throw new OptimisticLockVersionMismatchError(ImportForm.name, form.version, locked.version);

      form.status = status;
      form.approver = approver;
      form.approverName = fullName(approver);
      const saved = await manager.save(form);

      if (status === ImportFormStatus.Confirmed) {
        await this.inventoryService.receive(
          manager,
          form.warehouse.id,
          items.map((item) => {
            // Vật tư bị xoá mềm sau khi ghi dòng ⇒ relation không load được.
            if (!item.material)
              throw new ImportFormException(
                ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND,
              );
            return { materialId: item.material.id, quantity: item.baseQuantity };
          }),
          currentUser,
          `Import form ${form.code}`,
        );
        // 1 dòng ⇒ 1 lô mang mã của dòng (ngày nhập = ngày phiếu, hạn dùng = hạn của dòng), cùng
        // transaction cộng tồn.
        await this.materialBatchService.createFromImportItems(manager, form, items);
      }
      return saved;
    });
    this.logger.log(`Import form ${form.id} -> ${status}`, context);
    return this.mapper.map(updated, ImportForm, ImportFormResponseDto);
  }

  /**
   * `version` có mặt ⇒ optimistic lock: TypeORM tự ném `OptimisticLockVersionMismatchError` (thành
   * `DATA_VERSION_CONFLICT` 409 qua filter global) nếu phiếu đã bị người khác sửa.
   */
  private async findForm(warehouseSlug: string, slug: string, version?: number) {
    const form = await this.importFormRepository.findOne({
      where: { slug, warehouse: { slug: warehouseSlug } },
      relations: IMPORT_FORM_DETAIL_RELATIONS,
      order: { items: { lineNo: 'ASC' } },
      ...(version !== undefined && { lock: { mode: 'optimistic' as const, version } }),
    });
    if (!form) throw new ImportFormException(ImportFormValidation.IMPORT_FORM_NOT_FOUND);
    return form;
  }

  /**
   * Khoá đầu phiếu (`FOR UPDATE`, không kèm relations — MySQL khoá luôn dòng bảng JOIN) và kiểm lại
   * `DRAFT` trên bản đã khoá.
   */
  private async lockDraft(manager: EntityManager, id: string): Promise<ImportForm> {
    const locked = await manager.findOne(ImportForm, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) throw new ImportFormException(ImportFormValidation.IMPORT_FORM_NOT_FOUND);
    this.assertIsDraft(locked);
    return locked;
  }

  /**
   * Ghi `total` mới và LUÔN tăng `version` (kể cả khi `total` không đổi — dòng đơn giá 0): xác
   * nhận/PATCH so version trên bản khoá để biết dòng phiếu chưa đổi kể từ lần đọc. `save()` chỉ tăng
   * `@VersionColumn` khi có cột đổi nên không dùng được ở đây.
   */
  private async saveTotal(manager: EntityManager, locked: ImportForm, total: number) {
    await manager.update(ImportForm, { id: locked.id }, { total, version: locked.version + 1 });
  }

  /** `lineNo` lớn nhất của phiếu (0 khi chưa có dòng) — gọi dưới khoá đầu phiếu. */
  private async lastLineNo(manager: EntityManager, formId: string): Promise<number> {
    const { max } = await manager
      .createQueryBuilder(ImportFormItem, 'item')
      .select('MAX(item.lineNo)', 'max')
      .where('item.importForm = :formId', { formId })
      .getRawOne<{ max: number | string | null }>();
    return Number(max ?? 0);
  }

  /**
   * Dựng `quantity` dòng (mỗi dòng 1 đơn vị, chưa có mã/`lineNo`) từ body: vật tư tra theo `barcode`
   * hoặc `materialSlug` (đúng 1 trong 2), đơn vị phải gắn với vật tư (không gửi ⇒ đơn vị cơ sở),
   * snapshot tỉ lệ quy đổi + mã/tên + nhà cung cấp, `baseQuantity` = tỉ lệ, `amount` = đơn giá.
   * Vật tư phải đã gán vào kho của phiếu (có dòng `inventory_tbl`) — nếu không, xác nhận phiếu sẽ
   * không có dòng tồn để cộng. `supplierLinks`: cặp (vật tư, nhà cung cấp) chưa gắn — caller ghi
   * trong transaction.
   */
  private async buildLines(
    dto: AddImportFormItemRequestDto,
    warehouseId: string,
    formDate: string,
  ): Promise<{ lines: ImportFormItem[]; supplierLinks: MaterialSupplierLink[] }> {
    if (!dto.barcode === !dto.materialSlug)
      throw new ImportFormException(
        ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED,
      );

    const material = await this.materialRepository.findOne({
      where: dto.barcode ? { barcode: dto.barcode } : { slug: dto.materialSlug },
      relations: { baseUnit: true, unitsCanHave: { unit: true }, suppliers: true },
    });
    if (!material)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND);
    const assigned = await this.inventoryRepository.count({
      where: { warehouse: { id: warehouseId }, material: { id: material.id } },
    });
    if (!assigned)
      throw new ImportFormException(
        ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE,
      );

    const unitSlug = dto.unitSlug ?? material.baseUnit?.slug;
    if (!unitSlug)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED);
    const row = material.unitsCanHave?.find((mu) => mu.unit?.slug === unitSlug);
    if (!row)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL);

    // Rào dữ liệu bẩn như `MaterialService.convert`: bảng join ghi thẳng dưới DB được.
    const conversionRate = Number(row.conversionRate);
    if (!Number.isFinite(conversionRate) || conversionRate <= 0 || conversionRate >= QUANTITY_MAX)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID);

    this.assertExpiry(dto.expiryDate, formDate);
    const amount = roundMoney(dto.unitPrice);
    if (amount >= MONEY_MAX)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_TOTAL_INVALID);

    const supplier = await this.pickSupplier(material, dto.supplierSlug);
    const supplierLinks =
      supplier && !material.suppliers?.some(({ id }) => id === supplier.id)
        ? [{ materialId: material.id, supplierId: supplier.id }]
        : [];

    const lines = Array.from({ length: dto.quantity ?? 1 }, () =>
      Object.assign(new ImportFormItem(), {
        material,
        materialCode: material.code,
        materialName: material.name,
        supplierSlug: supplier?.slug ?? null,
        supplierCode: supplier?.code ?? null,
        supplierName: supplier?.name ?? null,
        supplierTaxCode: supplier?.taxCode ?? null,
        supplierAddress: supplier?.address ?? null,
        unit: row.unit,
        unitCode: row.unit.code,
        unitName: row.unit.name,
        quantity: 1,
        conversionRate,
        baseQuantity: roundToScale(conversionRate),
        unitPrice: dto.unitPrice,
        amount,
        note: dto.note ?? null,
        expiryDate: dto.expiryDate ?? null,
      }),
    );
    return { lines, supplierLinks };
  }

  /**
   * Nhà cung cấp snapshot vào dòng phiếu. Vật tư - nhà cung cấp là n - n nên dòng phải chỉ ra
   * nhà cung cấp nào: gửi `supplierSlug` thì lấy nhà cung cấp đó — chưa gắn với vật tư thì tra bảng
   * nhà cung cấp (caller tự gắn; không tồn tại/đã xoá mềm ⇒ `SUPPLIER_NOT_FOUND`, lỗi của module
   * supplier, cố ý không bọc lại); không gửi thì lấy nhà cung cấp DUY NHẤT của vật tư, còn 0 hoặc
   * nhiều nhà cung cấp thì để trống (không tự đoán).
   */
  private async pickSupplier(
    material: Material,
    supplierSlug: string | undefined,
  ): Promise<Supplier | null> {
    const suppliers = material.suppliers ?? [];
    if (!supplierSlug) return suppliers.length === 1 ? suppliers[0] : null;
    const attached = suppliers.find(({ slug }) => slug === supplierSlug);
    if (attached) return attached;
    const supplier = await this.supplierRepository.findOne({ where: { slug: supplierSlug } });
    if (!supplier) throw new SupplierException(SupplierValidation.SUPPLIER_NOT_FOUND);
    return supplier;
  }

  /** Hạn dùng (nếu có) không được trước ngày nhập — so chuỗi `YYYY-MM-DD` đúng thứ tự ngày. */
  private assertExpiry(expiryDate: string | null | undefined, formDate: string): void {
    if (expiryDate && expiryDate < formDate)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID);
  }

  private assertIsDraft(form: ImportForm): void {
    if (form.status !== ImportFormStatus.Draft)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_NOT_DRAFT);
  }

  /**
   * `@RequireAuthority` là AND nên không biểu diễn được "có bản đầy đủ HOẶC bản `_OWN`" — route
   * sửa/xoá không gắn decorator, check nằm ở đây (cần dữ liệu phiếu để biết "của mình" hay không):
   * - có `fullCode` ⇒ sửa/xoá mọi phiếu nháp của kho;
   * - chỉ có `ownCode` ⇒ chỉ phiếu mình là người lập;
   * - không có cả hai ⇒ 403 như `AuthorityGuard`.
   * `SUPER_ADMIN` bypass, khớp `AuthorityGuard`. Logic chung ở `assertFullOrOwnAuthority`.
   */
  private assertCanModify(
    form: ImportForm,
    currentUser: CurrentUserDto,
    fullCode: TAuthorityCode,
    ownCode: TAuthorityCode,
  ): void {
    assertFullOrOwnAuthority(
      currentUser,
      fullCode,
      ownCode,
      form.requester?.id,
      () => new ImportFormException(ImportFormValidation.IMPORT_FORM_NOT_OWNER),
    );
  }

  private async findUser(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);
    return user;
  }
}
