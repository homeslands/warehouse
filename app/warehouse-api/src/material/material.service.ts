import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  And,
  EntityManager,
  FindOptionsRelations,
  FindOptionsWhere,
  In,
  LessThan,
  Like,
  MoreThanOrEqual,
  Raw,
  Repository,
} from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  ConvertMaterialQuantityRequestDto,
  CreateMaterialConversionUnitRequestDto,
  CreateMaterialRequestDto,
  GetAllMaterialRequestDto,
  GetConversionUnitRequestDto,
  MaterialConversionResultResponseDto,
  MaterialConversionUnitResponseDto,
  MaterialResponseDto,
  UpdateMaterialConversionUnitRequestDto,
  UpdateMaterialRequestDto,
  AssignMaterialSuppliersRequestDto,
} from './material.dto';
import { Material, MATERIAL_SUPPLIER_TABLE } from './material.entity';
import { deleteMaterialSuppliers, insertMaterialSuppliers } from './material-supplier.util';
import { MaterialUnit } from './material-unit.entity';
import { MaterialException } from './material.exception';
import { MaterialValidation } from './material.validation';
import { MaterialTypeService } from 'src/material-type/material-type.service';
import { UnitService } from 'src/unit/unit.service';
import { UnitResponseDto } from 'src/unit/unit.dto';
import { Unit } from 'src/unit/unit.entity';
import { Inventory } from 'src/inventory/inventory.entity';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { pickDefined } from 'src/shared/utils/obj.util';
import { escapeLike, resolveDateRange } from 'src/shared/utils/query.util';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { TransactionManagerService } from 'src/db/transaction-manager.service';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierException } from 'src/supplier/supplier.exception';
import { SupplierValidation } from 'src/supplier/supplier.validation';

/**
 * `type`/`baseUnit` cố tình KHÔNG `eager` trên entity, nên mọi read path phải truyền hằng này —
 * thiếu nó thì response im lặng mất `type`/`baseUnit`/`suppliers`, không có lỗi nào báo ra.
 */
const MATERIAL_RELATIONS: FindOptionsRelations<Material> = {
  type: true,
  baseUnit: true,
  suppliers: true,
};

@Injectable()
export class MaterialService {
  constructor(
    @InjectRepository(Material) private readonly materialRepository: Repository<Material>,
    // Chỉ để đếm tham chiếu lúc xoá — inject Repository chứ không inject service của module kia,
    // tránh vòng phụ thuộc `Material <-> Inventory`.
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    // Bảng join material <-> unit: chứa CẢ đơn vị cơ sở (rate = 1) lẫn các đơn vị quy đổi.
    @InjectRepository(MaterialUnit)
    private readonly materialUnitRepository: Repository<MaterialUnit>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly materialTypeService: MaterialTypeService,
    private readonly unitService: UnitService,
    // Đặt/đổi đơn vị cơ sở phải ghi 2 bảng theo đúng thứ tự (FK tổ hợp), không thể để nửa chừng.
    private readonly transactionManagerService: TransactionManagerService,
    // Chỉ tra nhà cung cấp theo slug cho `assignSuppliers` — entity, không import `SupplierModule`.
    @InjectRepository(Supplier) private readonly supplierRepository: Repository<Supplier>,
  ) {}

  /** Tỉ lệ quy đổi của chính đơn vị cơ sở — bất biến, không cho sửa. */
  private static readonly BASE_UNIT_RATE = 1;

  /** id vật tư gắn với ÍT NHẤT 1 nhà cung cấp chưa xoá mềm (subquery cho `findAll`). */
  private static readonly HAS_SUPPLIER_SQL =
    `SELECT ms.material_id_column FROM ${MATERIAL_SUPPLIER_TABLE} ms ` +
    'JOIN supplier_tbl s ON s.id_column = ms.supplier_id_column ' +
    'WHERE s.deleted_at_column IS NULL';

  private static readonly SUPPLIED_BY_SLUG_SQL = `${MaterialService.HAS_SUPPLIER_SQL} AND s.slug_column = :supplierSlug`;

  /**
   * Đặt đơn vị cơ sở phải ghi 2 bảng theo ĐÚNG THỨ TỰ: tạo vật tư (chưa có base) → tạo dòng join
   * `(material, unit, rate = 1)` → mới trỏ `base_unit_id` vào dòng đó. Ngược thứ tự là vi phạm FK
   * tổ hợp `(id, base_unit_id) -> (material_id, unit_id)`. Vì vậy cả 3 bước nằm trong 1 transaction
   * — hỏng giữa chừng sẽ để lại vật tư trỏ vào đơn vị không tồn tại trong danh sách của chính nó.
   */
  async createMaterial(dto: CreateMaterialRequestDto): Promise<MaterialResponseDto> {
    const context = `${MaterialService.name}.${this.createMaterial.name}`;
    const prepared = await this.prepareMaterial(dto);
    const created = await this.transactionManagerService.execute((manager) =>
      this.insertMaterial(manager, prepared),
    );

    this.logger.log(`Material created: ${created.id}`, context);
    // Vật tư mới chưa gán vào kho nào.
    return { ...this.mapper.map(created, Material, MaterialResponseDto), warehouses: [] };
  }

  /**
   * Bản chạy trong transaction của CALLER — `InventoryService.createMaterialInWarehouse` tạo vật tư
   * và gán vào kho cùng 1 transaction. Trả entity (đã có `type`/`baseUnit`), không phải response.
   */
  async createMaterialIn(manager: EntityManager, dto: CreateMaterialRequestDto): Promise<Material> {
    const context = `${MaterialService.name}.${this.createMaterialIn.name}`;
    const created = await this.insertMaterial(manager, await this.prepareMaterial(dto));
    this.logger.log(`Material created: ${created.id}`, context);
    return created;
  }

  /** Mọi rào + resolve quan hệ của tạo vật tư, chạy TRƯỚC khi ghi để lỗi nghiệp vụ không chạm DB. */
  private async prepareMaterial(
    dto: CreateMaterialRequestDto,
  ): Promise<{ data: Material; baseUnit: Unit }> {
    const data = this.mapper.map(dto, CreateMaterialRequestDto, Material);

    await this.assertCodeIsFree(data.code);
    this.assertInventoryRange(data.minimumInventory, data.maximumInventory);
    // Ném `MATERIAL_TYPE_NOT_FOUND` nếu slug sai — lỗi của module material-type, cố ý không bọc lại.
    data.type = await this.materialTypeService.findEntityBySlug(dto.typeSlug);
    // `baseUnitSlug` bắt buộc (DTO chặn thiếu/`null`). Ném `UNIT_NOT_FOUND` nếu slug sai (lỗi của
    // module unit, cố ý không bọc lại).
    const baseUnit = await this.unitService.findEntityBySlug(dto.baseUnitSlug);
    return { data, baseUnit };
  }

  /** 3 bước ghi theo đúng thứ tự FK tổ hợp (xem `createMaterial`), trong transaction `manager`. */
  private async insertMaterial(
    manager: EntityManager,
    { data, baseUnit }: { data: Material; baseUnit: Unit },
  ): Promise<Material> {
    const material = await manager.save(this.materialRepository.create(data));

    await manager.save(
      this.materialUnitRepository.create({
        materialId: material.id,
        unitId: baseUnit.id,
        conversionRate: MaterialService.BASE_UNIT_RATE,
      }),
    );
    material.baseUnit = baseUnit;
    return manager.save(material);
  }

  async findAll(
    query: GetAllMaterialRequestDto,
  ): Promise<AppPaginatedResponseDto<MaterialResponseDto>> {
    const { start, end } = resolveDateRange(query.startDate, query.endDate);
    if (start && end && start >= end)
      throw new MaterialException(MaterialValidation.MATERIAL_DATE_RANGE_INVALID);

    const where: FindOptionsWhere<Material> = {};
    if (query.typeSlug) where.type = { slug: query.typeSlug };
    // Tìm theo tiền tố (`LIKE 'x%'`) — dùng được index của `code_column`, khác substring `%x%`.
    if (query.code) where.code = Like(`${escapeLike(query.code)}%`);
    if (query.name) where.name = Like(`${escapeLike(query.name)}%`);
    if (start && end) where.createdAt = And(MoreThanOrEqual(start), LessThan(end));
    else if (start) where.createdAt = MoreThanOrEqual(start);
    else if (end) where.createdAt = LessThan(end);
    // Lọc bằng subquery trên bảng join, KHÔNG bằng `where.suppliers`: `suppliers` cũng được load qua
    // `relations`, `where` trên nó thì TypeORM lọc luôn danh sách nhà cung cấp trả về (chỉ còn đúng
    // nhà cung cấp đang lọc). Chỉ tính nhà cung cấp chưa xoá mềm — khớp `hasSupplier`/`suppliers`
    // trong response (relation tự bỏ bản ghi xoá mềm).
    // `supplierSlug` cụ thể hơn `hasSupplier` nên được ưu tiên (gửi cả 2 mâu thuẫn nhau thì bỏ cờ).
    if (query.supplierSlug)
      where.id = Raw((alias) => `${alias} IN (${MaterialService.SUPPLIED_BY_SLUG_SQL})`, {
        supplierSlug: query.supplierSlug,
      });
    else if (query.hasSupplier === true)
      where.id = Raw((alias) => `${alias} IN (${MaterialService.HAS_SUPPLIER_SQL})`);
    else if (query.hasSupplier === false)
      where.id = Raw((alias) => `${alias} NOT IN (${MaterialService.HAS_SUPPLIER_SQL})`);
    // JOIN `inventory_tbl` chỉ để lọc (TypeORM tự thêm `deleted_at IS NULL` cho bảng join ⇒ vật tư
    // đã gỡ khỏi kho không khớp). 1 vật tư có tối đa 1 dòng/kho nên không nhân bản kết quả.
    if (query.warehouseSlug) where.inventories = { warehouse: { slug: query.warehouseSlug } };

    const [items, total] = await this.materialRepository.findAndCount({
      where,
      relations: MATERIAL_RELATIONS,
      order: { createdAt: query.sort ?? 'DESC', id: 'ASC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: await this.toResponses(items),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<MaterialResponseDto>;
  }

  async findOne(slug: string): Promise<MaterialResponseDto> {
    const material = await this.findEntityBySlug(slug);
    const [response] = await this.toResponses([material]);
    return response;
  }

  /**
   * Map sang response kèm `warehouses` — tra `inventory_tbl` bằng 1 query cho cả trang, KHÔNG qua
   * relation `inventories` của query chính (có `where` trên nó thì TypeORM lọc luôn danh sách kho).
   */
  private async toResponses(materials: Material[]): Promise<MaterialResponseDto[]> {
    const rows = materials.length
      ? await this.inventoryRepository.find({
          where: { material: { id: In(materials.map((material) => material.id)) } },
          relations: { warehouse: true, material: true },
          order: { warehouse: { code: 'ASC' } },
        })
      : [];

    return materials.map((material) => {
      material.inventories = rows.filter((row) => row.material.id === material.id);
      return this.mapper.map(material, Material, MaterialResponseDto);
    });
  }

  /** Dùng bởi `InventoryService` để resolve `materialSlug` -> entity. */
  async findEntityBySlug(slug: string): Promise<Material> {
    const material = await this.materialRepository.findOne({
      where: { slug },
      relations: MATERIAL_RELATIONS,
    });
    if (!material) throw new MaterialException(MaterialValidation.MATERIAL_NOT_FOUND);
    return material;
  }

  async updateMaterial(slug: string, dto: UpdateMaterialRequestDto): Promise<MaterialResponseDto> {
    const context = `${MaterialService.name}.${this.updateMaterial.name}`;
    const material = await this.materialRepository.findOne({
      where: { slug },
      relations: MATERIAL_RELATIONS,
    });
    if (!material) throw new MaterialException(MaterialValidation.MATERIAL_NOT_FOUND);

    // PATCH partial: `pickDefined` bỏ mọi field client không gửi ⇒ field vắng mặt giữ nguyên giá
    // trị cũ.
    const data = pickDefined(this.mapper.map(dto, UpdateMaterialRequestDto, Material));
    if (data.code !== undefined && data.code !== material.code)
      await this.assertCodeIsFree(data.code);
    // So sánh ngưỡng trên giá trị SAU khi ghép, không phải trên mỗi phần client gửi: PATCH chỉ đổi
    // `minimumInventory` vẫn phải bị chặn nếu nó vượt `maximumInventory` đang có trong DB.
    this.assertInventoryRange(
      data.minimumInventory ?? material.minimumInventory,
      data.maximumInventory ?? material.maximumInventory,
    );
    // Không gửi `typeSlug` = giữ nguyên loại vật tư cũ; gửi rồi mới tra (tra với `undefined` sẽ ném
    // `MATERIAL_TYPE_NOT_FOUND` oan).
    if (dto.typeSlug !== undefined)
      data.type = await this.materialTypeService.findEntityBySlug(dto.typeSlug);
    // Cùng lý do với `typeSlug`: chỉ resolve khi client CÓ gửi. `null` không xoá được base unit về
    // NULL (`pickDefined` lọc cả `null`) — đúng quy ước chung của repo, chưa có đường gỡ base unit.
    const nextBaseUnit =
      dto.baseUnitSlug === undefined
        ? undefined
        : await this.unitService.findEntityBySlug(dto.baseUnitSlug);
    if (nextBaseUnit && nextBaseUnit.id !== material.baseUnit?.id)
      await this.assertBaseUnitChangeAllowed(material);

    Object.assign(material, data);

    const updated = await this.transactionManagerService.execute(async (manager) => {
      if (!nextBaseUnit || nextBaseUnit.id === material.baseUnit?.id) return manager.save(material);

      const previousBaseUnitId = material.baseUnit?.id;
      // Thứ tự bắt buộc bởi FK tổ hợp: dòng join của đơn vị mới phải TỒN TẠI trước khi `base_unit_id`
      // trỏ vào nó, và dòng cũ chỉ được xoá SAU khi con trỏ đã rời đi (RESTRICT).
      const existed = await manager.countBy(MaterialUnit, {
        materialId: material.id,
        unitId: nextBaseUnit.id,
      });
      if (existed === 0)
        await manager.save(
          this.materialUnitRepository.create({
            materialId: material.id,
            unitId: nextBaseUnit.id,
            conversionRate: MaterialService.BASE_UNIT_RATE,
          }),
        );

      material.baseUnit = nextBaseUnit;
      const saved = await manager.save(material);

      if (previousBaseUnitId)
        await manager.delete(MaterialUnit, {
          materialId: material.id,
          unitId: previousBaseUnitId,
        });
      return saved;
    });

    this.logger.log(`Material updated: ${updated.id}`, context);
    const [response] = await this.toResponses([updated]);
    return response;
  }

  /**
   * `PUT /materials/:slug/suppliers` — THAY toàn bộ tập nhà cung cấp của vật tư bằng `supplierSlugs`
   * (rỗng = gỡ hết). Tất-cả-hoặc-không: 1 slug không tồn tại / đã xoá mềm ⇒ `SUPPLIER_NOT_FOUND`
   * cho cả lô, không ghi gì. Chỉ ghi phần chênh lệch (thêm cặp mới, gỡ cặp thừa) trong 1 transaction.
   */
  async assignSuppliers(
    slug: string,
    dto: AssignMaterialSuppliersRequestDto,
  ): Promise<MaterialResponseDto> {
    const context = `${MaterialService.name}.${this.assignSuppliers.name}`;
    const material = await this.findEntityBySlug(slug);
    const suppliers = dto.supplierSlugs.length
      ? await this.supplierRepository.find({
          where: { slug: In(dto.supplierSlugs) },
          order: { code: 'ASC' },
        })
      : [];
    if (suppliers.length !== dto.supplierSlugs.length)
      throw new SupplierException(SupplierValidation.SUPPLIER_NOT_FOUND);

    const currentIds = new Set((material.suppliers ?? []).map(({ id }) => id));
    const nextIds = new Set(suppliers.map(({ id }) => id));
    const toAdd = [...nextIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

    if (toAdd.length || toRemove.length)
      await this.transactionManagerService.execute(async (manager) => {
        await deleteMaterialSuppliers(manager, [material.id], toRemove);
        await insertMaterialSuppliers(
          manager,
          toAdd.map((supplierId) => ({ materialId: material.id, supplierId })),
        );
      });

    material.suppliers = suppliers;
    this.logger.log(
      `Material ${material.id} suppliers: +${toAdd.length} -${toRemove.length}`,
      context,
    );
    const [response] = await this.toResponses([material]);
    return response;
  }

  /**
   * Đổi đơn vị cơ sở = đổi NGHĨA của mọi `conversionRate` đã lưu và của mọi con số tồn kho (tồn
   * luôn tính theo đơn vị cơ sở). Chỉ cho đổi khi vật tư còn "sạch": chưa có tồn ở kho nào và chưa
   * gắn đơn vị quy đổi nào ngoài chính đơn vị cơ sở — tức là mới khai sai và sửa lại ngay.
   */
  private async assertBaseUnitChangeAllowed(material: Material): Promise<void> {
    if (!material.baseUnit) return;

    const [withStock, attached] = await Promise.all([
      this.inventoryRepository
        .createQueryBuilder('wm')
        .where('wm.material_id_column = :materialId', { materialId: material.id })
        .andWhere('wm.quantity_column > 0')
        .getCount(),
      this.materialUnitRepository.countBy({ materialId: material.id }),
    ]);

    if (withStock > 0 || attached > 1)
      throw new MaterialException(MaterialValidation.MATERIAL_BASE_UNIT_LOCKED);
  }

  async deleteMaterial(slug: string): Promise<number> {
    const context = `${MaterialService.name}.${this.deleteMaterial.name}`;
    const material = await this.findEntityBySlug(slug);

    // Xoá mềm nên FK không chặn giúp: row `inventory_tbl` vẫn trỏ vào vật tư đã "xoá".
    const assigned = await this.inventoryRepository.countBy({
      material: { id: material.id },
    });
    if (assigned > 0) throw new MaterialException(MaterialValidation.MATERIAL_IN_USE);

    await this.materialRepository.softRemove(material);
    this.logger.log(`Material deleted: ${material.id}`, context);
    return 1;
  }

  /**
   * UNIQUE index của MySQL KHÔNG bỏ qua bản ghi xoá mềm — phải tra kèm `withDeleted` và phân biệt
   * "đang dùng" với "bị bản ghi đã xoá giữ chỗ", thay vì để `ER_DUP_ENTRY` thành lỗi 500.
   */
  private async assertCodeIsFree(code: string): Promise<void> {
    const existed = await this.materialRepository.findOne({ where: { code }, withDeleted: true });
    if (!existed) return;
    throw new MaterialException(
      existed.deletedAt
        ? MaterialValidation.MATERIAL_CODE_RESERVED_BY_DELETED
        : MaterialValidation.MATERIAL_CODE_DOES_EXIST,
    );
  }

  /** Các đơn vị quy đổi ĐÃ GẮN cho vật tư, kèm tỉ lệ quy đổi. */
  async findConversionUnits(
    slug: string,
    query: GetConversionUnitRequestDto,
  ): Promise<AppPaginatedResponseDto<MaterialConversionUnitResponseDto>> {
    const material = await this.findEntityBySlug(slug);

    const where: FindOptionsWhere<MaterialUnit> = { materialId: material.id };
    const unitWhere: FindOptionsWhere<Unit> = {};
    if (query.code) unitWhere.code = query.code;
    if (query.name) unitWhere.name = Like(`%${query.name}%`);
    if (Object.keys(unitWhere).length > 0) where.unit = unitWhere;

    const [items, total] = await this.materialUnitRepository.findAndCount({
      where,
      // Bảng join không kế thừa `Base` nên không có `createdAt` để sắp xếp — dùng mã đơn vị.
      relations: { unit: true },
      order: { unit: { code: 'ASC' } },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      // `isBaseUnit` không map bằng automapper được: nó là so sánh với `material.baseUnit`, thứ
      // nằm ngoài dòng join.
      items: this.mapper
        .mapArray(items, MaterialUnit, MaterialConversionUnitResponseDto)
        .map((item, index) => ({
          ...item,
          isBaseUnit: items[index].unitId === material.baseUnit?.id,
        })),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<MaterialConversionUnitResponseDto>;
  }

  /**
   * Các Unit CHỌN ĐƯỢC làm đơn vị quy đổi = toàn bộ unit TRỪ những unit đã gắn. Không cần loại
   * riêng đơn vị cơ sở: nó đã nằm trong danh sách đã gắn.
   */
  async findAvailableConversionUnits(
    slug: string,
    query: GetConversionUnitRequestDto,
  ): Promise<AppPaginatedResponseDto<UnitResponseDto>> {
    const material = await this.findEntityBySlug(slug);
    const attached = await this.materialUnitRepository.find({
      where: { materialId: material.id },
      select: { unitId: true },
    });

    return this.unitService.findAll(
      query,
      attached.map((row) => row.unitId),
    );
  }

  async addConversionUnit(
    slug: string,
    dto: CreateMaterialConversionUnitRequestDto,
  ): Promise<MaterialConversionUnitResponseDto> {
    const context = `${MaterialService.name}.${this.addConversionUnit.name}`;
    const material = await this.findEntityBySlug(slug);
    // `conversionRate` đếm theo đơn vị cơ sở — chưa có base unit thì con số đó không có mốc nào để
    // hiểu, nên chặn ngay thay vì lưu một tỉ lệ treo lơ lửng.
    if (!material.baseUnit)
      throw new MaterialException(MaterialValidation.MATERIAL_BASE_UNIT_IS_REQUIRED);

    // Đơn vị cơ sở nay CŨNG là 1 dòng của bảng join, nên gắn lại chính nó rơi vào rào "đã tồn tại"
    // bên dưới — không cần rào riêng nữa.
    const unit = await this.unitService.findEntityBySlug(dto.unitSlug);

    const existed = await this.materialUnitRepository.countBy({
      materialId: material.id,
      unitId: unit.id,
    });
    if (existed > 0)
      throw new MaterialException(MaterialValidation.MATERIAL_CONVERSION_UNIT_DOES_EXIST);

    // Gán tay thay vì qua automapper: entity có PK tổ hợp, map tự động dễ ghi đè nhầm khoá.
    const created = await this.materialUnitRepository.save(
      this.materialUnitRepository.create({
        materialId: material.id,
        unitId: unit.id,
        conversionRate: dto.conversionRate,
      }),
    );
    // `save()` không load lại quan hệ — không gán thì response mất sạch 3 field `unit*`.
    created.unit = unit;

    this.logger.log(`Conversion unit ${unit.id} attached to material ${material.id}`, context);
    return {
      ...this.mapper.map(created, MaterialUnit, MaterialConversionUnitResponseDto),
      isBaseUnit: false,
    };
  }

  async updateConversionUnit(
    slug: string,
    unitSlug: string,
    dto: UpdateMaterialConversionUnitRequestDto,
  ): Promise<MaterialConversionUnitResponseDto> {
    const context = `${MaterialService.name}.${this.updateConversionUnit.name}`;
    const { row, material } = await this.findConversionUnitRow(slug, unitSlug);
    // Tỉ lệ của chính đơn vị cơ sở là mốc của mọi tỉ lệ khác, luôn = 1. DB không ép được (nó chỉ
    // biết dòng nào đang được trỏ tới), nên rào ở đây.
    if (row.unitId === material.baseUnit?.id)
      throw new MaterialException(MaterialValidation.MATERIAL_BASE_UNIT_RATE_IS_FIXED);

    // PATCH partial: field không gửi giữ nguyên giá trị cũ. Bảng join không có cột
    // `version` nên ở đây không có optimistic lock — 2 người sửa
    // cùng lúc thì người sau thắng, chấp nhận được vì mỗi dòng chỉ có đúng 1 số.
    const data = pickDefined({ conversionRate: dto.conversionRate });
    Object.assign(row, data);

    const updated = await this.materialUnitRepository.save(row);
    this.logger.log(`Conversion unit ${row.unitId} updated on material ${row.materialId}`, context);
    return {
      ...this.mapper.map(updated, MaterialUnit, MaterialConversionUnitResponseDto),
      isBaseUnit: false,
    };
  }

  async removeConversionUnit(slug: string, unitSlug: string): Promise<number> {
    const context = `${MaterialService.name}.${this.removeConversionUnit.name}`;
    const { row, material } = await this.findConversionUnitRow(slug, unitSlug);
    // FK tổ hợp `ON DELETE RESTRICT` cũng chặn, nhưng nó ném lỗi SQL thô thành 500 — trả mã nghiệp
    // vụ đọc được thay vì để MySQL nói hộ.
    if (row.unitId === material.baseUnit?.id)
      throw new MaterialException(MaterialValidation.MATERIAL_BASE_UNIT_CANNOT_BE_DETACHED);

    // Xoá CỨNG: bảng join không có cột soft-delete, 1 cặp (material, unit) chỉ tồn tại hoặc không.
    await this.materialUnitRepository.delete({ materialId: row.materialId, unitId: row.unitId });
    this.logger.log(
      `Conversion unit ${row.unitId} detached from material ${row.materialId}`,
      context,
    );
    return 1;
  }

  /**
   * Quy đổi số lượng giữa 2 đơn vị của CÙNG 1 vật tư, luôn đi qua đơn vị cơ sở làm trung gian:
   * `toQuantity = (fromQuantity × rate(from)) ÷ rate(to)`, với `rate` = số đơn vị cơ sở trong 1
   * đơn vị đó (dòng của chính đơn vị cơ sở có rate = 1).
   */
  async convertQuantity(
    slug: string,
    dto: ConvertMaterialQuantityRequestDto,
  ): Promise<MaterialConversionResultResponseDto> {
    const material = await this.findEntityBySlug(slug);
    if (!material.baseUnit)
      throw new MaterialException(MaterialValidation.MATERIAL_BASE_UNIT_IS_REQUIRED);

    const from = await this.resolveConversionRate(material, dto.fromUnitSlug);
    const to = await this.resolveConversionRate(material, dto.toUnitSlug);

    const quantityInBaseUnit = roundToScale(dto.quantity * from.rate);
    const toQuantity = roundToScale(quantityInBaseUnit / to.rate);

    return {
      materialSlug: material.slug,
      fromUnitSlug: from.unit.slug,
      fromUnitCode: from.unit.code,
      fromQuantity: dto.quantity,
      fromConversionRate: from.rate,
      toUnitSlug: to.unit.slug,
      toUnitCode: to.unit.code,
      toQuantity,
      toConversionRate: to.rate,
      baseUnitSlug: material.baseUnit.slug,
      baseUnitCode: material.baseUnit.code,
      quantityInBaseUnit,
    } as MaterialConversionResultResponseDto;
  }

  /**
   * Đơn vị hợp lệ cho phép quy đổi = MỘT DÒNG bất kỳ trong bảng join của vật tư — kể cả đơn vị cơ
   * sở, vì nó cũng có dòng riêng (rate = 1). Unit có thật nhưng không thuộc vật tư này ⇒
   * `MATERIAL_CONVERSION_UNIT_NOT_FOUND`.
   */
  private async resolveConversionRate(
    material: Material,
    unitSlug: string,
  ): Promise<{ unit: Unit; rate: number }> {
    const unit = await this.unitService.findEntityBySlug(unitSlug);

    const row = await this.materialUnitRepository.findOne({
      where: { materialId: material.id, unitId: unit.id },
    });
    if (!row) throw new MaterialException(MaterialValidation.MATERIAL_CONVERSION_UNIT_NOT_FOUND);

    // Rào dữ liệu bẩn: bảng join ghi thẳng dưới DB được, `rate <= 0` sẽ cho ra Infinity/NaN thay vì
    // một lỗi đọc được. DTO chỉ chặn được đường đi qua API.
    const rate = Number(row.conversionRate);
    if (!Number.isFinite(rate) || rate <= 0)
      throw new MaterialException(MaterialValidation.MATERIAL_CONVERSION_RATE_INVALID);
    return { unit, rate };
  }

  /** Slug vật tư/đơn vị sai ⇒ lỗi của chính nó; đúng cả 2 nhưng chưa gắn ⇒ CONVERSION_UNIT_NOT_FOUND. */
  private async findConversionUnitRow(
    slug: string,
    unitSlug: string,
  ): Promise<{ row: MaterialUnit; material: Material }> {
    const material = await this.findEntityBySlug(slug);
    const unit = await this.unitService.findEntityBySlug(unitSlug);

    const row = await this.materialUnitRepository.findOne({
      where: { materialId: material.id, unitId: unit.id },
      relations: { unit: true },
    });
    if (!row) throw new MaterialException(MaterialValidation.MATERIAL_CONVERSION_UNIT_NOT_FOUND);
    return { row, material };
  }

  private assertInventoryRange(minimum: number, maximum: number): void {
    if (maximum < minimum)
      throw new MaterialException(MaterialValidation.MATERIAL_INVENTORY_RANGE_INVALID);
  }
}
