import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Between,
  FindOptionsRelations,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreateSupplierRequestDto,
  CreateSupplierTransactionRequestDto,
  GetAllSupplierRequestDto,
  GetSupplierMaterialRequestDto,
  GetSupplierTransactionRequestDto,
  SupplierMaterialResponseDto,
  SupplierMaterialSlugsRequestDto,
  SupplierResponseDto,
  SupplierTransactionResponseDto,
  UpdateSupplierRequestDto,
} from './supplier.dto';
import { Supplier } from './supplier.entity';
import { SupplierTransaction } from './supplier-transaction.entity';
import { MATERIAL_TRANSACTION_TYPES, MONEY_SCALE } from './supplier.constants';
import { pickDefined } from 'src/shared/utils/obj.util';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { SupplierException } from './supplier.exception';
import { SupplierValidation } from './supplier.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { Material } from 'src/material/material.entity';
import { MaterialException } from 'src/material/material.exception';
import { MaterialValidation } from 'src/material/material.validation';
import { CurrentUserDto } from 'src/user/user.decorator';
import { User } from 'src/user/user.entity';

const MATERIAL_RELATIONS: FindOptionsRelations<Material> = { type: true, baseUnit: true };

const TRANSACTION_RELATIONS: FindOptionsRelations<SupplierTransaction> = {
  material: true,
  performedBy: true,
};

const roundMoney = (value: number): number => Number(value.toFixed(MONEY_SCALE));

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier) private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(SupplierTransaction)
    private readonly transactionRepository: Repository<SupplierTransaction>,
    @InjectRepository(Material) private readonly materialRepository: Repository<Material>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async createSupplier(dto: CreateSupplierRequestDto): Promise<SupplierResponseDto> {
    const context = `${SupplierService.name}.${this.createSupplier.name}`;
    const data = this.mapper.map(dto, CreateSupplierRequestDto, Supplier);

    await this.assertCodeIsFree(data.code);
    if (data.taxCode) await this.assertTaxCodeIsFree(data.taxCode);

    const created = await this.supplierRepository.save(this.supplierRepository.create(data));
    this.logger.log(`Supplier created: ${created.id}`, context);
    return this.mapper.map(created, Supplier, SupplierResponseDto);
  }

  async findAll(
    query: GetAllSupplierRequestDto,
  ): Promise<AppPaginatedResponseDto<SupplierResponseDto>> {
    const filters: FindOptionsWhere<Supplier> = {};
    if (query.code) filters.code = query.code;
    if (query.taxCode) filters.taxCode = query.taxCode;
    if (query.phonenumber) filters.phonenumber = Like(`%${query.phonenumber}%`);

    // `where` dạng mảng ⇒ TypeORM nối các phần tử bằng OR, mỗi phần tử bọc trong ngoặc riêng. Lặp
    // lại `filters` trong từng nhánh để ra: filters AND (name LIKE OR contactPerson LIKE OR email LIKE).
    const keyword = query.search ? Like(`%${query.search}%`) : undefined;
    const where: FindOptionsWhere<Supplier> | FindOptionsWhere<Supplier>[] = keyword
      ? [
          { ...filters, name: keyword },
          { ...filters, contactPerson: keyword },
          { ...filters, email: keyword },
        ]
      : filters;

    const [items, total] = await this.supplierRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    return this.paginate(query, total, this.mapper.mapArray(items, Supplier, SupplierResponseDto));
  }

  async findOne(slug: string): Promise<SupplierResponseDto> {
    const supplier = await this.getSupplierOrThrow(slug);
    return this.mapper.map(supplier, Supplier, SupplierResponseDto);
  }

  async updateSupplier(slug: string, dto: UpdateSupplierRequestDto): Promise<SupplierResponseDto> {
    const supplier = await this.getSupplierOrThrow(slug);

    // PATCH partial: xem `pickDefined` — field không gửi giữ nguyên giá trị cũ.
    const data = pickDefined(this.mapper.map(dto, UpdateSupplierRequestDto, Supplier));
    if (data.code !== undefined && data.code !== supplier.code) {
      await this.assertCodeIsFree(data.code);
    }
    if (data.taxCode !== undefined && data.taxCode !== supplier.taxCode) {
      await this.assertTaxCodeIsFree(data.taxCode);
    }

    Object.assign(supplier, data);
    const updated = await this.supplierRepository.save(supplier);
    return this.mapper.map(updated, Supplier, SupplierResponseDto);
  }

  /**
   * Chặn xoá khi còn vật tư đang gắn: xoá mềm nhà cung cấp không gỡ FK ở `material_tbl`, vật tư sẽ
   * trỏ vào 1 nhà cung cấp "đã biến mất" mà không gắn lại được vào đâu cho tới khi gỡ tay.
   */
  async deleteSupplier(slug: string): Promise<number> {
    const supplier = await this.getSupplierOrThrow(slug);
    const materialCount = await this.materialRepository.countBy({
      supplier: { id: supplier.id },
    });
    if (materialCount > 0) throw new SupplierException(SupplierValidation.SUPPLIER_HAS_MATERIALS);

    await this.supplierRepository.softRemove(supplier);
    return 1;
  }

  // ---------- Vật tư của nhà cung cấp (1 - n) ----------

  async findMaterials(
    slug: string,
    query: GetSupplierMaterialRequestDto,
  ): Promise<AppPaginatedResponseDto<SupplierMaterialResponseDto>> {
    const supplier = await this.getSupplierOrThrow(slug);
    const where: FindOptionsWhere<Material> = { supplier: { id: supplier.id } };
    if (query.typeSlug) where.type = { slug: query.typeSlug };
    if (query.code) where.code = query.code;
    if (query.name) where.name = Like(`%${query.name}%`);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to) where.createdAt = Between(from, to);
    else if (from) where.createdAt = MoreThanOrEqual(from);
    else if (to) where.createdAt = LessThanOrEqual(to);

    const [items, total] = await this.materialRepository.findAndCount({
      where,
      relations: MATERIAL_RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    return this.paginate(
      query,
      total,
      this.mapper.mapArray(items, Material, SupplierMaterialResponseDto),
    );
  }

  /**
   * Gắn vật tư vào nhà cung cấp. Idempotent khi đã gắn đúng nhà cung cấp này; đã gắn nhà cung cấp
   * KHÁC thì báo lỗi thay vì âm thầm chuyển — muốn đổi phải gỡ khỏi bên cũ trước.
   */
  /**
   * Gắn hàng loạt, tất-cả-hoặc-không: 1 vật tư không tồn tại / đang thuộc nhà cung cấp khác là cả lô
   * bị từ chối. Vật tư đã thuộc chính nhà cung cấp này thì bỏ qua (idempotent). UPDATE kèm điều kiện
   * `supplier IS NULL` trong transaction: vật tư bị nhà cung cấp khác gắn chen giữa lúc đọc và lúc
   * ghi thì số dòng đổi lệch ⇒ rollback cả lô thay vì ghi đè.
   */
  async attachMaterials(
    slug: string,
    dto: SupplierMaterialSlugsRequestDto,
  ): Promise<SupplierMaterialResponseDto[]> {
    const supplier = await this.getSupplierOrThrow(slug);
    const materials = await this.getMaterialsOrThrow(dto.materialSlugs);

    if (materials.some((material) => material.supplier && material.supplier.id !== supplier.id)) {
      throw new SupplierException(SupplierValidation.SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER);
    }
    const freeIds = materials.filter((material) => !material.supplier).map(({ id }) => id);
    if (freeIds.length) {
      await this.materialRepository.manager.transaction(async (manager) => {
        const { affected } = await manager.update(
          Material,
          { id: In(freeIds), supplier: IsNull() },
          { supplier: { id: supplier.id } },
        );
        if (affected !== freeIds.length) {
          throw new SupplierException(
            SupplierValidation.SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER,
          );
        }
      });
    }
    return this.mapper.mapArray(materials, Material, SupplierMaterialResponseDto);
  }

  /**
   * Gỡ hàng loạt, tất-cả-hoặc-không: mọi vật tư trong lô phải đang thuộc nhà cung cấp này. UPDATE
   * kèm điều kiện `supplier = :id` vì cùng lý do với `attachMaterials`.
   */
  async detachMaterials(slug: string, dto: SupplierMaterialSlugsRequestDto): Promise<number> {
    const supplier = await this.getSupplierOrThrow(slug);
    const materials = await this.getMaterialsOrThrow(dto.materialSlugs);

    if (materials.some((material) => material.supplier?.id !== supplier.id)) {
      throw new SupplierException(SupplierValidation.SUPPLIER_MATERIAL_NOT_ATTACHED);
    }
    const ids = materials.map(({ id }) => id);
    await this.materialRepository.manager.transaction(async (manager) => {
      const { affected } = await manager.update(
        Material,
        { id: In(ids), supplier: { id: supplier.id } },
        { supplier: null },
      );
      if (affected !== ids.length) {
        throw new SupplierException(SupplierValidation.SUPPLIER_MATERIAL_NOT_ATTACHED);
      }
    });
    return ids.length;
  }

  // ---------- Giao dịch với nhà cung cấp (append-only) ----------

  async createTransaction(
    actor: CurrentUserDto,
    slug: string,
    dto: CreateSupplierTransactionRequestDto,
  ): Promise<SupplierTransactionResponseDto> {
    const context = `${SupplierService.name}.${this.createTransaction.name}`;
    const supplier = await this.getSupplierOrThrow(slug);

    const data: Partial<SupplierTransaction> = {
      supplier,
      type: dto.type,
      transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
      note: dto.note,
      performedBy: actor?.userId ? ({ id: actor.userId } as User) : null,
    };

    if (MATERIAL_TRANSACTION_TYPES.includes(dto.type)) {
      const material = await this.getMaterialOrThrow(dto.materialSlug);
      if (material.supplier?.id !== supplier.id) {
        throw new SupplierException(SupplierValidation.SUPPLIER_MATERIAL_NOT_ATTACHED);
      }
      const quantity = roundToScale(Number(dto.quantity));
      const unitPrice = roundMoney(Number(dto.unitPrice));
      Object.assign(data, {
        material,
        quantity,
        unitPrice,
        amount: roundMoney(quantity * unitPrice),
      });
    } else {
      if (
        dto.materialSlug !== undefined ||
        dto.quantity !== undefined ||
        dto.unitPrice !== undefined
      ) {
        throw new SupplierException(SupplierValidation.SUPPLIER_TRANSACTION_PAYMENT_HAS_MATERIAL);
      }
      data.amount = roundMoney(Number(dto.amount));
    }

    const created = await this.transactionRepository.save(this.transactionRepository.create(data));
    this.logger.log(`Supplier transaction created: ${created.id}`, context);

    const reloaded = await this.transactionRepository.findOne({
      where: { id: created.id },
      relations: TRANSACTION_RELATIONS,
      withDeleted: true,
    });
    return this.mapper.map(
      reloaded ?? created,
      SupplierTransaction,
      SupplierTransactionResponseDto,
    );
  }

  async findTransactions(
    slug: string,
    query: GetSupplierTransactionRequestDto,
  ): Promise<AppPaginatedResponseDto<SupplierTransactionResponseDto>> {
    const supplier = await this.getSupplierOrThrow(slug);

    const where: FindOptionsWhere<SupplierTransaction> = { supplier: { id: supplier.id } };
    if (query.type) where.type = query.type;
    if (query.materialSlug) where.material = { slug: query.materialSlug };
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to) where.transactionDate = Between(from, to);
    else if (from) where.transactionDate = MoreThanOrEqual(from);
    else if (to) where.transactionDate = LessThanOrEqual(to);

    const [items, total] = await this.transactionRepository.findAndCount({
      where,
      relations: TRANSACTION_RELATIONS,
      // Vật tư/người thao tác bị xoá mềm sau đó vẫn phải hiện trong lịch sử.
      withDeleted: true,
      order: { transactionDate: 'DESC', createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    return this.paginate(
      query,
      total,
      this.mapper.mapArray(items, SupplierTransaction, SupplierTransactionResponseDto),
    );
  }

  // ---------- helpers ----------

  private async getSupplierOrThrow(slug: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOneBy({ slug });
    if (!supplier) throw new SupplierException(SupplierValidation.SUPPLIER_NOT_FOUND);
    return supplier;
  }

  // Thiếu bất kỳ slug nào trong lô (không tồn tại / đã xoá mềm) ⇒ `MATERIAL_NOT_FOUND` cho cả lô.
  private async getMaterialsOrThrow(slugs: string[]): Promise<Material[]> {
    const unique = [...new Set(slugs)];
    const materials = await this.materialRepository.find({
      where: { slug: In(unique) },
      relations: { ...MATERIAL_RELATIONS, supplier: true },
    });
    if (materials.length !== unique.length)
      throw new MaterialException(MaterialValidation.MATERIAL_NOT_FOUND);
    return materials;
  }

  private async getMaterialOrThrow(slug: string): Promise<Material> {
    const material = await this.materialRepository.findOne({
      where: { slug },
      relations: { ...MATERIAL_RELATIONS, supplier: true },
    });
    if (!material) throw new MaterialException(MaterialValidation.MATERIAL_NOT_FOUND);
    return material;
  }

  /**
   * `code` có UNIQUE index ở DB nhưng index đó KHÔNG bỏ qua bản ghi xoá mềm — nên phải tra kèm
   * `withDeleted` và phân biệt 2 tình huống, thay vì để MySQL ném `ER_DUP_ENTRY` thành lỗi 500.
   */
  private async assertCodeIsFree(code: string): Promise<void> {
    const existed = await this.supplierRepository.findOne({ where: { code }, withDeleted: true });
    if (!existed) return;
    throw new SupplierException(
      existed.deletedAt
        ? SupplierValidation.SUPPLIER_CODE_RESERVED_BY_DELETED_SUPPLIER
        : SupplierValidation.SUPPLIER_CODE_DOES_EXIST,
    );
  }

  /** Chỉ unique giữa các bản ghi CHƯA xoá mềm — không có UNIQUE index DB trên cột này. */
  private async assertTaxCodeIsFree(taxCode: string): Promise<void> {
    const existed = await this.supplierRepository.findOneBy({ taxCode });
    if (existed) throw new SupplierException(SupplierValidation.SUPPLIER_TAX_CODE_DOES_EXIST);
  }

  private paginate<T>(
    query: { page: number; size: number },
    total: number,
    items: T[],
  ): AppPaginatedResponseDto<T> {
    const totalPages = Math.ceil(total / query.size);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<T>;
  }
}
