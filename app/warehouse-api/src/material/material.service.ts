import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindOptionsRelations, FindOptionsWhere, Like, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreateMaterialConversionUnitRequestDto,
  CreateMaterialRequestDto,
  GetAllMaterialRequestDto,
  GetConversionUnitRequestDto,
  MaterialConversionUnitResponseDto,
  MaterialResponseDto,
  UpdateMaterialConversionUnitRequestDto,
  UpdateMaterialRequestDto,
} from './material.dto';
import { Material } from './material.entity';
import { MaterialUnit } from './material-unit.entity';
import { MaterialException } from './material.exception';
import { MaterialValidation } from './material.validation';
import { MaterialTypeService } from 'src/material-type/material-type.service';
import { UnitService } from 'src/unit/unit.service';
import { UnitResponseDto } from 'src/unit/unit.dto';
import { Unit } from 'src/unit/unit.entity';
import { WarehouseMaterial } from 'src/warehouse-material/warehouse-material.entity';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { pickDefined } from 'src/shared/utils/obj.util';

/**
 * `type`/`baseUnit` cố tình KHÔNG `eager` trên entity, nên mọi read path phải truyền hằng này —
 * thiếu nó thì response im lặng mất `typeSlug`/`typeCode`/`baseUnitSlug`, không có lỗi nào báo ra.
 */
const MATERIAL_RELATIONS: FindOptionsRelations<Material> = { type: true, baseUnit: true };

@Injectable()
export class MaterialService {
  constructor(
    @InjectRepository(Material) private readonly materialRepository: Repository<Material>,
    // Chỉ để đếm tham chiếu lúc xoá — inject Repository chứ không inject service của module kia,
    // tránh vòng phụ thuộc `Material <-> WarehouseMaterial`.
    @InjectRepository(WarehouseMaterial)
    private readonly warehouseMaterialRepository: Repository<WarehouseMaterial>,
    // Bảng join material <-> unit, chỉ dùng để kiểm tra 1 unit đã là đơn vị QUY ĐỔI của vật tư
    // hay chưa trước khi cho nó làm đơn vị CƠ SỞ.
    @InjectRepository(MaterialUnit)
    private readonly materialUnitRepository: Repository<MaterialUnit>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly materialTypeService: MaterialTypeService,
    private readonly unitService: UnitService,
  ) {}

  async createMaterial(dto: CreateMaterialRequestDto): Promise<MaterialResponseDto> {
    const context = `${MaterialService.name}.${this.createMaterial.name}`;
    const data = this.mapper.map(dto, CreateMaterialRequestDto, Material);

    await this.assertCodeIsFree(data.code);
    this.assertInventoryRange(data.minimumInventory, data.maximumInventory);
    // Ném `MATERIAL_TYPE_NOT_FOUND` nếu slug sai — lỗi của module material-type, cố ý không bọc lại.
    data.type = await this.materialTypeService.findEntityBySlug(dto.typeSlug);
    // Không gửi `baseUnitSlug` = vật tư chưa khai đơn vị cơ sở (cột NULL-able). Ở đường tạo mới
    // KHÔNG cần rào "base unit không được là đơn vị quy đổi": vật tư chưa tồn tại nên chưa có dòng
    // nào trong `material_unit_can_have_tbl`. Ném `UNIT_NOT_FOUND` nếu slug sai (lỗi của module
    // unit, cố ý không bọc lại).
    if (dto.baseUnitSlug !== undefined)
      data.baseUnit = await this.unitService.findEntityBySlug(dto.baseUnitSlug);

    const created = await this.materialRepository.save(this.materialRepository.create(data));
    this.logger.log(`Material created: ${created.id}`, context);
    return this.mapper.map(created, Material, MaterialResponseDto);
  }

  async findAll(
    query: GetAllMaterialRequestDto,
  ): Promise<AppPaginatedResponseDto<MaterialResponseDto>> {
    const where: FindOptionsWhere<Material> = {};
    if (query.typeSlug) where.type = { slug: query.typeSlug };
    if (query.code) where.code = query.code;
    if (query.name) where.name = Like(`%${query.name}%`);

    const [items, total] = await this.materialRepository.findAndCount({
      where,
      relations: MATERIAL_RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, Material, MaterialResponseDto),
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
    return this.mapper.map(material, Material, MaterialResponseDto);
  }

  /** Dùng bởi `WarehouseMaterialService` để resolve `materialSlug` -> entity. */
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
      lock: { mode: 'optimistic', version: dto.version },
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
    if (dto.baseUnitSlug !== undefined) {
      const baseUnit = await this.unitService.findEntityBySlug(dto.baseUnitSlug);
      await this.assertNotConversionUnit(material.id, baseUnit.id);
      data.baseUnit = baseUnit;
    }

    Object.assign(material, data);
    const updated = await this.materialRepository.save(material);
    this.logger.log(`Material updated: ${updated.id}`, context);
    return this.mapper.map(updated, Material, MaterialResponseDto);
  }

  async deleteMaterial(slug: string): Promise<number> {
    const context = `${MaterialService.name}.${this.deleteMaterial.name}`;
    const material = await this.findEntityBySlug(slug);

    // Xoá mềm nên FK không chặn giúp: row `warehouse_material_tbl` vẫn trỏ vào vật tư đã "xoá".
    const assigned = await this.warehouseMaterialRepository.countBy({
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

  /** Các đơn vị quy đổi ĐÃ GẮN cho vật tư, kèm tỉ lệ quy đổi và quy cách đóng gói. */
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
      items: this.mapper.mapArray(items, MaterialUnit, MaterialConversionUnitResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<MaterialConversionUnitResponseDto>;
  }

  /**
   * Các Unit CHỌN ĐƯỢC làm đơn vị quy đổi: toàn bộ unit TRỪ đơn vị cơ sở của vật tư (quy đổi base
   * sang chính base là vô nghĩa) và TRỪ những unit đã gắn rồi. Vật tư chưa khai base unit thì chỉ
   * loại các unit đã gắn.
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

    const excluded = [material.baseUnit?.id, ...attached.map((row) => row.unitId)].filter(
      (id): id is string => Boolean(id),
    );
    return this.unitService.findAll(query, excluded);
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

    const unit = await this.unitService.findEntityBySlug(dto.unitSlug);
    if (unit.id === material.baseUnit.id)
      throw new MaterialException(MaterialValidation.MATERIAL_BASE_UNIT_IS_CONVERSION_UNIT);

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
        quantity: dto.quantity ?? 1,
      }),
    );
    // `save()` không load lại quan hệ — không gán thì response mất sạch 3 field `unit*`.
    created.unit = unit;

    this.logger.log(`Conversion unit ${unit.id} attached to material ${material.id}`, context);
    return this.mapper.map(created, MaterialUnit, MaterialConversionUnitResponseDto);
  }

  async updateConversionUnit(
    slug: string,
    unitSlug: string,
    dto: UpdateMaterialConversionUnitRequestDto,
  ): Promise<MaterialConversionUnitResponseDto> {
    const context = `${MaterialService.name}.${this.updateConversionUnit.name}`;
    const row = await this.findConversionUnitRow(slug, unitSlug);

    // PATCH partial: field không gửi giữ nguyên giá trị cũ. Bảng join KHÔNG kế thừa
    // `VersionedBase` (không có cột `version`) nên ở đây không có optimistic lock — 2 người sửa
    // cùng lúc thì người sau thắng, chấp nhận được vì mỗi dòng chỉ có 2 số độc lập.
    const data = pickDefined({ conversionRate: dto.conversionRate, quantity: dto.quantity });
    Object.assign(row, data);

    const updated = await this.materialUnitRepository.save(row);
    this.logger.log(`Conversion unit ${row.unitId} updated on material ${row.materialId}`, context);
    return this.mapper.map(updated, MaterialUnit, MaterialConversionUnitResponseDto);
  }

  async removeConversionUnit(slug: string, unitSlug: string): Promise<number> {
    const context = `${MaterialService.name}.${this.removeConversionUnit.name}`;
    const row = await this.findConversionUnitRow(slug, unitSlug);

    // Xoá CỨNG: bảng join không có cột soft-delete, 1 cặp (material, unit) chỉ tồn tại hoặc không.
    await this.materialUnitRepository.delete({ materialId: row.materialId, unitId: row.unitId });
    this.logger.log(
      `Conversion unit ${row.unitId} detached from material ${row.materialId}`,
      context,
    );
    return 1;
  }

  /** Slug vật tư/đơn vị sai ⇒ lỗi của chính nó; đúng cả 2 nhưng chưa gắn ⇒ CONVERSION_UNIT_NOT_FOUND. */
  private async findConversionUnitRow(slug: string, unitSlug: string): Promise<MaterialUnit> {
    const material = await this.findEntityBySlug(slug);
    const unit = await this.unitService.findEntityBySlug(unitSlug);

    const row = await this.materialUnitRepository.findOne({
      where: { materialId: material.id, unitId: unit.id },
      relations: { unit: true },
    });
    if (!row) throw new MaterialException(MaterialValidation.MATERIAL_CONVERSION_UNIT_NOT_FOUND);
    return row;
  }

  /**
   * Rào "1 unit chỉ được làm base HOẶC đơn vị quy đổi của cùng 1 vật tư, không cả hai". DB không
   * biểu diễn được ràng buộc này bằng index nào (nó vắt qua 2 bảng), nên nó sống ở đây.
   */
  private async assertNotConversionUnit(materialId: string, unitId: string): Promise<void> {
    const usedAsConversion = await this.materialUnitRepository.countBy({ materialId, unitId });
    if (usedAsConversion > 0)
      throw new MaterialException(MaterialValidation.MATERIAL_BASE_UNIT_IS_CONVERSION_UNIT);
  }

  private assertInventoryRange(minimum: number, maximum: number): void {
    if (maximum < minimum)
      throw new MaterialException(MaterialValidation.MATERIAL_INVENTORY_RANGE_INVALID);
  }
}
