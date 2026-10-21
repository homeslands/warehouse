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
  ChangeImportFormStatusRequestDto,
  CreateImportFormItemDto,
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
  IMPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES,
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
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { Inventory } from 'src/inventory/inventory.entity';
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

/** Trần của DECIMAL(18,2) (16 chữ số phần nguyên) và DECIMAL(18,6) (12 chữ số phần nguyên). */
const MONEY_MAX = 1e16;
const QUANTITY_MAX = 1e12;

const roundMoney = (value: number) => Number(value.toFixed(2));

const fullName = (user: User) => `${user.lastName} ${user.firstName}`.trim();

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
    private readonly inventoryService: InventoryService,
    private readonly s3Service: S3Service,
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
    this.assertCanUpload(currentUser);
    if (!file) throw new FileException(FileValidation.FILE_NOT_FOUND);
    if (!IMPORT_FORM_UPLOAD_ALLOWED_MIME_TYPES.includes(file.mimetype))
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_FILE_TYPE_NOT_ALLOWED);

    const key = await this.s3Service.uploadFile(file, IMPORT_FORM_UPLOAD_FOLDER);
    this.logger.log(`Import form file uploaded: ${key}`, context);
    return this.s3Service.getFileUrl(key);
  }

  private assertCanUpload(currentUser: CurrentUserDto): void {
    if (currentUser.roleName === RoleEnum.SuperAdmin) return;
    const scope = currentUser.scope ?? [];
    const allowed = [
      AuthorityCode.ImportFormCreate,
      AuthorityCode.ImportFormUpdateDraft,
      AuthorityCode.ImportFormUpdateDraftOwn,
    ].some((code) => scope.includes(code));
    if (!allowed) throw new ForbiddenException();
  }

  async createImportForm(
    warehouseSlug: string,
    dto: CreateImportFormRequestDto,
    currentUser: CurrentUserDto,
  ): Promise<ImportFormResponseDto> {
    const context = `${ImportFormService.name}.${this.createImportForm.name}`;
    const warehouse = await this.findWarehouse(warehouseSlug);
    if (!warehouse.isActive)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_WAREHOUSE_INACTIVE);

    const data = this.mapper.map(dto, CreateImportFormRequestDto, ImportForm);
    await this.assertCodeIsFree(data.code);
    const { items, total, supplierLinks } = await this.buildItems(dto.items, warehouse.id);
    const requester = await this.findUser(currentUser.userId);

    const form = this.importFormRepository.create({
      ...data,
      requester,
      requesterName: fullName(requester),
      approver: null,
      approverName: null,
      status: ImportFormStatus.Draft,
      warehouse,
      total,
    });
    // Đầu phiếu + dòng vật tư trong 1 transaction: ghi dòng nào lỗi (FK, UNIQUE, mất kết nối...)
    // thì rollback cả phiếu — không để lại phiếu không có dòng hoặc thiếu dòng. Gắn nhà cung cấp
    // mới vào vật tư cũng nằm trong transaction này: phiếu lỗi thì không để lại cặp gắn dở.
    const created = await this.transactionManagerService.execute(async (manager) => {
      await insertMaterialSuppliers(manager, supplierLinks);
      const saved = await manager.save(form);
      saved.items = await this.saveItems(manager, saved, items);
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
    await this.findWarehouse(warehouseSlug);

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
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, ImportForm, ImportFormResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<ImportFormResponseDto>;
  }

  /**
   * Vật tư ghi được vào phiếu nhập của kho = vật tư đã gán vào kho (có dòng `inventory_tbl`), kèm
   * các đơn vị đã gắn để client chọn `unitSlug`. Cùng nguồn với rào trong `buildItems`.
   */
  async findAvailableMaterials(
    warehouseSlug: string,
    query: GetImportFormAvailableMaterialRequestDto,
  ): Promise<AppPaginatedResponseDto<ImportFormAvailableMaterialResponseDto>> {
    const warehouse = await this.findWarehouse(warehouseSlug);

    const materialWhere: FindOptionsWhere<Material> = {};
    if (query.code) materialWhere.code = Like(`${escapeLike(query.code)}%`);
    if (query.name) materialWhere.name = Like(`%${query.name}%`);

    const [rows, total] = await this.inventoryRepository.findAndCount({
      where: { warehouse: { id: warehouse.id }, material: materialWhere },
      relations: { material: { baseUnit: true, suppliers: true, unitsCanHave: { unit: true } } },
      order: { material: { code: 'ASC' } },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: rows.map(({ material, quantity }) => ({
        slug: material.slug,
        code: material.code,
        name: material.name,
        baseUnitSlug: material.baseUnit?.slug ?? null,
        quantity,
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
      })),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<ImportFormAvailableMaterialResponseDto>;
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

    // PATCH partial: xem `pickDefined` — field không gửi giữ nguyên giá trị cũ.
    const data = pickDefined(this.mapper.map(dto, UpdateImportFormRequestDto, ImportForm));
    if (data.code !== undefined && data.code !== form.code) await this.assertCodeIsFree(data.code);
    // Gửi `items` = thay toàn bộ dòng. Dựng + kiểm tra dòng mới TRƯỚC khi mở transaction để lỗi
    // nghiệp vụ không chạm DB; không gửi thì giữ nguyên dòng cũ.
    const replacement =
      dto.items !== undefined && dto.items !== null
        ? await this.buildItems(dto.items, form.warehouse.id)
        : undefined;

    Object.assign(form, data);
    if (replacement) form.total = replacement.total;
    const oldItems = form.items ?? [];

    // Đầu phiếu + thay dòng trong 1 transaction: lỗi ở bất kỳ bước nào thì rollback, phiếu và
    // dòng cũ còn nguyên như trước request.
    const updated = await this.transactionManagerService.execute(async (manager) => {
      // Tách `items` khỏi lần save đầu phiếu: dòng được ghi tường minh bên dưới, không để cascade
      // tự so sánh/ghi lại.
      form.items = undefined;
      const saved = await manager.save(form);
      if (!replacement) {
        saved.items = oldItems;
        return saved;
      }
      // Xoá cứng dòng cũ TRƯỚC khi ghi dòng mới — ngược lại UNIQUE (phiếu, vật tư, đơn vị) va
      // ngay với dòng cũ cùng cặp vật tư/đơn vị.
      if (oldItems.length)
        await manager.delete(
          ImportFormItem,
          oldItems.map((item) => item.id),
        );
      await insertMaterialSuppliers(manager, replacement.supplierLinks);
      saved.items = await this.saveItems(manager, saved, replacement.items);
      return saved;
    });
    return this.mapper.map(updated, ImportForm, ImportFormResponseDto);
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

    const approver = await this.findUser(currentUser.userId);
    const items = form.items ?? [];

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

      if (status === ImportFormStatus.Confirmed)
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

  /** Ghi dòng phiếu (đã dựng sẵn bởi `buildItems`) dưới `form`, trong transaction của caller. */
  private saveItems(
    manager: EntityManager,
    form: ImportForm,
    items: ImportFormItem[],
  ): Promise<ImportFormItem[]> {
    items.forEach((item) => (item.importForm = form));
    return manager.save(items);
  }

  /**
   * Dựng dòng phiếu từ body: resolve vật tư (1 query cho cả mảng), kiểm đơn vị thuộc vật tư, snapshot
   * tỉ lệ quy đổi + mã/tên + nhà cung cấp của vật tư, tính `baseQuantity`/`amount`, và `total` = Σ `amount`.
   * Vật tư phải đã gán vào kho của phiếu (có dòng `inventory_tbl`) — nếu không, xác nhận phiếu sẽ
   * không có dòng tồn để cộng; chặn ngay lúc ghi thay vì để phiếu nháp không bao giờ xác nhận được.
   * `supplierLinks`: các cặp (vật tư, nhà cung cấp) mà dòng chỉ ra nhưng chưa gắn — caller ghi trong
   * transaction của phiếu.
   */
  private async buildItems(
    dtos: CreateImportFormItemDto[],
    warehouseId: string,
  ): Promise<{ items: ImportFormItem[]; total: number; supplierLinks: MaterialSupplierLink[] }> {
    const seen = new Set<string>();
    for (const dto of dtos) {
      const key = `${dto.materialSlug}|${dto.unitSlug}`;
      if (seen.has(key))
        throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_DUPLICATED);
      seen.add(key);
    }

    const slugs = [...new Set(dtos.map((dto) => dto.materialSlug))];
    const materials = await this.materialRepository.find({
      where: { slug: In(slugs) },
      relations: { unitsCanHave: { unit: true }, suppliers: true },
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
    const unattachedSupplierBySlug = await this.findUnattachedSuppliers(dtos, materialBySlug);
    const supplierLinks = new Map<string, MaterialSupplierLink>();

    let total = 0;
    const items = dtos.map((dto, index) => {
      const material = materialBySlug.get(dto.materialSlug);
      if (!material)
        throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND);
      if (!assignedMaterialIds.has(material.id))
        throw new ImportFormException(
          ImportFormValidation.IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE,
        );
      const row = material.unitsCanHave?.find((mu) => mu.unit?.slug === dto.unitSlug);
      if (!row)
        throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL);

      // Rào dữ liệu bẩn như `MaterialService.convert`: bảng join ghi thẳng dưới DB được.
      const conversionRate = Number(row.conversionRate);
      if (!Number.isFinite(conversionRate) || conversionRate <= 0)
        throw new ImportFormException(
          ImportFormValidation.IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID,
        );

      const supplier = this.pickSupplier(material, dto.supplierSlug, unattachedSupplierBySlug);
      if (supplier && !material.suppliers?.some(({ id }) => id === supplier.id))
        supplierLinks.set(`${material.id}|${supplier.id}`, {
          materialId: material.id,
          supplierId: supplier.id,
        });

      const baseQuantity = roundToScale(dto.quantity * conversionRate);
      if (dto.quantity >= QUANTITY_MAX || baseQuantity >= QUANTITY_MAX || baseQuantity <= 0)
        throw new ImportFormException(ImportFormValidation.IMPORT_FORM_ITEM_QUANTITY_INVALID);
      const amount = roundMoney(dto.quantity * dto.unitPrice);
      if (amount >= MONEY_MAX)
        throw new ImportFormException(ImportFormValidation.IMPORT_FORM_TOTAL_INVALID);
      total = roundMoney(total + amount);

      const item = new ImportFormItem();
      Object.assign(item, {
        lineNo: index + 1,
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
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_TOTAL_INVALID);

    return { items, total, supplierLinks: [...supplierLinks.values()] };
  }

  /**
   * Nhà cung cấp mà dòng chỉ ra nhưng CHƯA gắn với vật tư của dòng đó — tra 1 query cho cả mảng,
   * trả map theo slug. Slug không tồn tại (hoặc đã xoá mềm) ⇒ `SUPPLIER_NOT_FOUND` (lỗi của module
   * supplier, cố ý không bọc lại), ném trước khi mở transaction.
   */
  private async findUnattachedSuppliers(
    dtos: CreateImportFormItemDto[],
    materialBySlug: Map<string, Material>,
  ): Promise<Map<string, Supplier>> {
    const slugs = new Set<string>();
    for (const { materialSlug, supplierSlug } of dtos) {
      const material = materialBySlug.get(materialSlug);
      // Vật tư không tồn tại: để vòng dựng dòng ném `IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND` như cũ.
      if (!material || !supplierSlug) continue;
      if (!material.suppliers?.some(({ slug }) => slug === supplierSlug)) slugs.add(supplierSlug);
    }
    if (!slugs.size) return new Map();

    const suppliers = await this.supplierRepository.find({ where: { slug: In([...slugs]) } });
    if (suppliers.length !== slugs.size)
      throw new SupplierException(SupplierValidation.SUPPLIER_NOT_FOUND);
    return new Map(suppliers.map((supplier) => [supplier.slug, supplier]));
  }

  /**
   * Nhà cung cấp snapshot vào dòng phiếu. Vật tư - nhà cung cấp là n - n nên dòng phải chỉ ra
   * nhà cung cấp nào: gửi `supplierSlug` thì lấy nhà cung cấp đó — chưa gắn với vật tư thì lấy từ
   * `unattached` (caller tự gắn); không gửi thì lấy nhà cung cấp DUY NHẤT của vật tư, còn 0 hoặc
   * nhiều nhà cung cấp thì để trống (không tự đoán).
   */
  private pickSupplier(
    material: Material,
    supplierSlug: string | undefined,
    unattached: Map<string, Supplier>,
  ): Supplier | null {
    const suppliers = material.suppliers ?? [];
    if (supplierSlug)
      return (
        suppliers.find(({ slug }) => slug === supplierSlug) ?? unattached.get(supplierSlug) ?? null
      );
    return suppliers.length === 1 ? suppliers[0] : null;
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
   * `SUPER_ADMIN` bypass, khớp `AuthorityGuard`.
   */
  private assertCanModify(
    form: ImportForm,
    currentUser: CurrentUserDto,
    fullCode: TAuthorityCode,
    ownCode: TAuthorityCode,
  ): void {
    if (currentUser.roleName === RoleEnum.SuperAdmin) return;
    const scope = currentUser.scope ?? [];
    if (scope.includes(fullCode)) return;
    if (!scope.includes(ownCode)) throw new ForbiddenException();
    if (form.requester?.id !== currentUser.userId)
      throw new ImportFormException(ImportFormValidation.IMPORT_FORM_NOT_OWNER);
  }

  /**
   * `code` có UNIQUE index ở DB nhưng index đó KHÔNG bỏ qua bản ghi xoá mềm — nên phải tra kèm
   * `withDeleted` và phân biệt 2 tình huống, thay vì để MySQL ném `ER_DUP_ENTRY` thành lỗi 500.
   */
  private async assertCodeIsFree(code: string): Promise<void> {
    const existed = await this.importFormRepository.findOne({
      where: { code },
      withDeleted: true,
    });
    if (!existed) return;
    throw new ImportFormException(
      existed.deletedAt
        ? ImportFormValidation.IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM
        : ImportFormValidation.IMPORT_FORM_CODE_DOES_EXIST,
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
