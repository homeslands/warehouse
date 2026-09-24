import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreateMaterialTypeRequestDto,
  GetAllMaterialTypeRequestDto,
  MaterialTypeResponseDto,
  UpdateMaterialTypeRequestDto,
} from './material-type.dto';
import { MaterialType } from './material-type.entity';
import { MaterialTypeException } from './material-type.exception';
import { MaterialTypeValidation } from './material-type.validation';
import { Material } from 'src/material/material.entity';
import { AppPaginatedResponseDto } from 'src/app/app.dto';

@Injectable()
export class MaterialTypeService {
  constructor(
    @InjectRepository(MaterialType)
    private readonly materialTypeRepository: Repository<MaterialType>,
    // Chỉ để đếm tham chiếu lúc xoá. Inject Repository chứ KHÔNG inject `MaterialService`: chiều
    // phụ thuộc module là `Material -> MaterialType`, gọi ngược lại sẽ thành vòng tròn.
    @InjectRepository(Material) private readonly materialRepository: Repository<Material>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async createMaterialType(dto: CreateMaterialTypeRequestDto): Promise<MaterialTypeResponseDto> {
    const context = `${MaterialTypeService.name}.${this.createMaterialType.name}`;
    const data = this.mapper.map(dto, CreateMaterialTypeRequestDto, MaterialType);

    await this.assertCodeIsFree(data.code);
    await this.assertNameIsFree(data.name);

    const created = await this.materialTypeRepository.save(
      this.materialTypeRepository.create(data),
    );
    this.logger.log(`Material type created: ${created.id}`, context);
    return this.mapper.map(created, MaterialType, MaterialTypeResponseDto);
  }

  async findAll(
    query: GetAllMaterialTypeRequestDto,
  ): Promise<AppPaginatedResponseDto<MaterialTypeResponseDto>> {
    const where: FindOptionsWhere<MaterialType> = {};
    if (query.code) where.code = query.code;
    if (query.name) where.name = Like(`%${query.name}%`);

    const [items, total] = await this.materialTypeRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, MaterialType, MaterialTypeResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<MaterialTypeResponseDto>;
  }

  async findOne(slug: string): Promise<MaterialTypeResponseDto> {
    const materialType = await this.findEntityBySlug(slug);
    return this.mapper.map(materialType, MaterialType, MaterialTypeResponseDto);
  }

  /** Dùng bởi `MaterialService` để resolve `typeSlug` -> entity. Trả entity, không phải DTO. */
  async findEntityBySlug(slug: string): Promise<MaterialType> {
    const materialType = await this.materialTypeRepository.findOneBy({ slug });
    if (!materialType)
      throw new MaterialTypeException(MaterialTypeValidation.MATERIAL_TYPE_NOT_FOUND);
    return materialType;
  }

  async updateMaterialType(
    slug: string,
    dto: UpdateMaterialTypeRequestDto,
  ): Promise<MaterialTypeResponseDto> {
    const context = `${MaterialTypeService.name}.${this.updateMaterialType.name}`;
    const materialType = await this.materialTypeRepository.findOne({
      where: { slug },
      lock: { mode: 'optimistic', version: dto.version },
    });
    if (!materialType)
      throw new MaterialTypeException(MaterialTypeValidation.MATERIAL_TYPE_NOT_FOUND);

    const data = this.mapper.map(dto, UpdateMaterialTypeRequestDto, MaterialType);
    if (data.code !== materialType.code) await this.assertCodeIsFree(data.code);
    if (data.name !== materialType.name) await this.assertNameIsFree(data.name);

    Object.assign(materialType, data);
    const updated = await this.materialTypeRepository.save(materialType);
    this.logger.log(`Material type updated: ${updated.id}`, context);
    return this.mapper.map(updated, MaterialType, MaterialTypeResponseDto);
  }

  async deleteMaterialType(slug: string): Promise<number> {
    const context = `${MaterialTypeService.name}.${this.deleteMaterialType.name}`;
    const materialType = await this.findEntityBySlug(slug);

    // Xoá mềm, nên FK trong DB không chặn giúp: `material_tbl` vẫn trỏ vào row đã "xoá" và
    // `GET /materials` vẫn trả về chúng với `typeSlug` mồ côi. Phải tự chặn ở đây.
    const referenced = await this.materialRepository.countBy({ type: { id: materialType.id } });
    if (referenced > 0)
      throw new MaterialTypeException(MaterialTypeValidation.MATERIAL_TYPE_IN_USE);

    await this.materialTypeRepository.softRemove(materialType);
    this.logger.log(`Material type deleted: ${materialType.id}`, context);
    return 1;
  }

  /**
   * UNIQUE index của MySQL KHÔNG bỏ qua bản ghi xoá mềm — phải tra kèm `withDeleted` và phân biệt
   * 2 tình huống, thay vì để MySQL ném `ER_DUP_ENTRY` thành lỗi 500. Cùng pattern `warehouse`.
   */
  private async assertCodeIsFree(code: string): Promise<void> {
    const existed = await this.materialTypeRepository.findOne({
      where: { code },
      withDeleted: true,
    });
    if (!existed) return;
    throw new MaterialTypeException(
      existed.deletedAt
        ? MaterialTypeValidation.MATERIAL_TYPE_CODE_RESERVED_BY_DELETED
        : MaterialTypeValidation.MATERIAL_TYPE_CODE_DOES_EXIST,
    );
  }

  private async assertNameIsFree(name: string): Promise<void> {
    const existed = await this.materialTypeRepository.findOneBy({ name });
    if (existed)
      throw new MaterialTypeException(MaterialTypeValidation.MATERIAL_TYPE_NAME_DOES_EXIST);
  }
}
