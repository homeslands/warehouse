import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { FindOptionsRelations, FindOptionsWhere, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  ChangeImportFormStatusRequestDto,
  CreateImportFormRequestDto,
  GetAllImportFormRequestDto,
  ImportFormResponseDto,
  UpdateImportFormRequestDto,
} from './import-form.dto';
import { ImportForm } from './import-form.entity';
import { ImportFormStatus } from './import-form.constants';
import { ImportFormException } from './import-form.exception';
import { ImportFormValidation } from './import-form.validation';
import { pickDefined } from 'src/shared/utils/obj.util';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { AuthorityCode, TAuthorityCode } from 'src/authority/authority.constants';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { User } from 'src/user/user.entity';
import { UserException } from 'src/user/user.exception';
import { UserValidation } from 'src/user/user.validation';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierException } from 'src/supplier/supplier.exception';
import { SupplierValidation } from 'src/supplier/supplier.validation';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { WarehouseException } from 'src/warehouse/warehouse.exception';
import { WarehouseValidation } from 'src/warehouse/warehouse.validation';

/** Response cần slug của người lập/người duyệt/kho — các cột snapshot còn lại nằm sẵn trên phiếu. */
const IMPORT_FORM_RELATIONS: FindOptionsRelations<ImportForm> = {
  requester: true,
  approver: true,
  warehouse: true,
};

const fullName = (user: User) => `${user.lastName} ${user.firstName}`.trim();

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
    @InjectRepository(Supplier) private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

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
    const supplier = await this.findSupplier(dto.supplierSlug);
    const requester = await this.findUser(currentUser.userId);

    const created = await this.importFormRepository.save(
      this.importFormRepository.create({
        ...data,
        ...this.supplierSnapshot(supplier),
        requester,
        requesterName: fullName(requester),
        approver: null,
        approverName: null,
        status: ImportFormStatus.Draft,
        warehouse,
      }),
    );
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

    const where: FindOptionsWhere<ImportForm> = { warehouse: { slug: warehouseSlug } };
    if (query.status) where.status = query.status;
    if (query.supplierSlug) where.supplierSlug = query.supplierSlug;

    const [items, total] = await this.importFormRepository.findAndCount({
      where,
      relations: IMPORT_FORM_RELATIONS,
      order: { createdAt: 'DESC' },
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
    // Đổi nhà cung cấp = chụp lại snapshot của nhà cung cấp mới; không gửi thì giữ snapshot cũ
    // (KHÔNG làm mới theo dữ liệu hiện tại của nhà cung cấp cũ).
    if (dto.supplierSlug !== undefined && dto.supplierSlug !== null)
      Object.assign(form, this.supplierSnapshot(await this.findSupplier(dto.supplierSlug)));

    Object.assign(form, data);
    const updated = await this.importFormRepository.save(form);
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

  /** `DRAFT` → `CONFIRMED`/`CANCELLED`, người quyết định được ghi làm `approver`. */
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
    form.status = status;
    form.approver = approver;
    form.approverName = fullName(approver);

    const updated = await this.importFormRepository.save(form);
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
      relations: IMPORT_FORM_RELATIONS,
      ...(version !== undefined && { lock: { mode: 'optimistic' as const, version } }),
    });
    if (!form) throw new ImportFormException(ImportFormValidation.IMPORT_FORM_NOT_FOUND);
    return form;
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

  /**
   * Cột tuỳ chọn ghi `null` chứ không `undefined`: TypeORM bỏ qua `undefined` lúc `save()`, nên đổi
   * sang nhà cung cấp không có MST/địa chỉ sẽ giữ lại MST/địa chỉ của nhà cung cấp cũ.
   */
  private supplierSnapshot(supplier: Supplier): Partial<ImportForm> {
    return {
      supplier,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      supplierSlug: supplier.slug,
      supplierTaxCode: supplier.taxCode ?? null,
      supplierAddress: supplier.address ?? null,
    };
  }

  private async findWarehouse(slug: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOneBy({ slug });
    if (!warehouse) throw new WarehouseException(WarehouseValidation.WAREHOUSE_NOT_FOUND);
    return warehouse;
  }

  private async findSupplier(slug: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOneBy({ slug });
    if (!supplier) throw new SupplierException(SupplierValidation.SUPPLIER_NOT_FOUND);
    return supplier;
  }

  private async findUser(id: string): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new UserException(UserValidation.USER_NOT_FOUND);
    return user;
  }
}
