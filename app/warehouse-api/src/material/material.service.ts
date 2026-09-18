import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindOptionsRelations, FindOptionsWhere, Like, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreateMaterialRequestDto,
  GetAllMaterialRequestDto,
  MaterialResponseDto,
  UpdateMaterialRequestDto,
} from './material.dto';
import { Material } from './material.entity';
import { MaterialException } from './material.exception';
import { MaterialValidation } from './material.validation';
import { MaterialTypeService } from 'src/material-type/material-type.service';
import { WarehouseMaterial } from 'src/warehouse-material/warehouse-material.entity';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { pickDefined } from 'src/shared/utils/obj.util';

/**
 * `type` cố tình KHÔNG `eager` trên entity, nên mọi read path phải truyền hằng này — thiếu nó thì
 * response im lặng mất `typeSlug`/`typeCode`, không có lỗi nào báo ra.
 */
const MATERIAL_RELATIONS: FindOptionsRelations<Material> = { type: true };

@Injectable()
export class MaterialService {
  constructor(
    @InjectRepository(Material) private readonly materialRepository: Repository<Material>,
    // Chỉ để đếm tham chiếu lúc xoá — inject Repository chứ không inject service của module kia,
    // tránh vòng phụ thuộc `Material <-> WarehouseMaterial`.
    @InjectRepository(WarehouseMaterial)
    private readonly warehouseMaterialRepository: Repository<WarehouseMaterial>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly materialTypeService: MaterialTypeService,
  ) {}

  async createMaterial(dto: CreateMaterialRequestDto): Promise<MaterialResponseDto> {
    const context = `${MaterialService.name}.${this.createMaterial.name}`;
    const data = this.mapper.map(dto, CreateMaterialRequestDto, Material);

    await this.assertCodeIsFree(data.code);
    this.assertInventoryRange(data.minimumInventory, data.maximumInventory);
    // Ném `MATERIAL_TYPE_NOT_FOUND` nếu slug sai — lỗi của module material-type, cố ý không bọc lại.
    data.type = await this.materialTypeService.findEntityBySlug(dto.typeSlug);

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

  private assertInventoryRange(minimum: number, maximum: number): void {
    if (maximum < minimum)
      throw new MaterialException(MaterialValidation.MATERIAL_INVENTORY_RANGE_INVALID);
  }
}
