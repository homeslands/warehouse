import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreateUnitRequestDto,
  GetAllUnitRequestDto,
  UnitResponseDto,
  UpdateUnitRequestDto,
} from './unit.dto';
import { Unit } from './unit.entity';
import { UnitException } from './unit.exception';
import { UnitValidation } from './unit.validation';
import { Material } from 'src/material/material.entity';
import { pickDefined } from 'src/shared/utils/obj.util';
import { AppPaginatedResponseDto } from 'src/app/app.dto';

@Injectable()
export class UnitService {
  constructor(
    @InjectRepository(Unit) private readonly unitRepository: Repository<Unit>,
    // Chỉ để đếm tham chiếu qua bảng join lúc xoá. Inject Repository chứ KHÔNG inject
    // `MaterialService` — tránh vòng phụ thuộc module, cùng pattern `MaterialTypeService`.
    @InjectRepository(Material) private readonly materialRepository: Repository<Material>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async createUnit(dto: CreateUnitRequestDto): Promise<UnitResponseDto> {
    const context = `${UnitService.name}.${this.createUnit.name}`;
    const data = this.mapper.map(dto, CreateUnitRequestDto, Unit);

    await this.assertCodeIsFree(data.code);
    await this.assertNameIsFree(data.name);

    const created = await this.unitRepository.save(this.unitRepository.create(data));
    this.logger.log(`Unit created: ${created.id}`, context);
    return this.mapper.map(created, Unit, UnitResponseDto);
  }

  async findAll(query: GetAllUnitRequestDto): Promise<AppPaginatedResponseDto<UnitResponseDto>> {
    const where: FindOptionsWhere<Unit> = {};
    if (query.code) where.code = query.code;
    if (query.name) where.name = Like(`%${query.name}%`);

    const [items, total] = await this.unitRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, Unit, UnitResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<UnitResponseDto>;
  }

  async findOne(slug: string): Promise<UnitResponseDto> {
    const unit = await this.findEntityBySlug(slug);
    return this.mapper.map(unit, Unit, UnitResponseDto);
  }

  /** Dùng bởi module khác để resolve `unitSlug` -> entity. Trả entity, không phải DTO. */
  async findEntityBySlug(slug: string): Promise<Unit> {
    const unit = await this.unitRepository.findOneBy({ slug });
    if (!unit) throw new UnitException(UnitValidation.UNIT_NOT_FOUND);
    return unit;
  }

  async updateUnit(slug: string, dto: UpdateUnitRequestDto): Promise<UnitResponseDto> {
    const context = `${UnitService.name}.${this.updateUnit.name}`;
    const unit = await this.unitRepository.findOne({
      where: { slug },
      lock: { mode: 'optimistic', version: dto.version },
    });
    if (!unit) throw new UnitException(UnitValidation.UNIT_NOT_FOUND);

    // PATCH partial: xem `pickDefined` — field không gửi giữ nguyên giá trị cũ, và chỉ check trùng
    // cho field CÓ mặt (thiếu rào `undefined` thì `assertCodeIsFree(undefined)` tra nhầm bản ghi).
    const data = pickDefined(this.mapper.map(dto, UpdateUnitRequestDto, Unit));
    if (data.code !== undefined && data.code !== unit.code) await this.assertCodeIsFree(data.code);
    if (data.name !== undefined && data.name !== unit.name) await this.assertNameIsFree(data.name);

    Object.assign(unit, data);
    const updated = await this.unitRepository.save(unit);
    this.logger.log(`Unit updated: ${updated.id}`, context);
    return this.mapper.map(updated, Unit, UnitResponseDto);
  }

  async deleteUnit(slug: string): Promise<number> {
    const context = `${UnitService.name}.${this.deleteUnit.name}`;
    const unit = await this.findEntityBySlug(slug);

    // Xoá mềm, nên FK của bảng join không chặn giúp: dòng trong `material_unit_can_have_tbl` vẫn
    // trỏ vào unit đã "xoá" và material vẫn khai nó là đơn vị dùng được. Phải tự chặn ở đây.
    const referenced = await this.materialRepository.count({
      where: { unitsCanHave: { id: unit.id } },
    });
    if (referenced > 0) throw new UnitException(UnitValidation.UNIT_IN_USE);

    await this.unitRepository.softRemove(unit);
    this.logger.log(`Unit deleted: ${unit.id}`, context);
    return 1;
  }

  /**
   * UNIQUE index của MySQL KHÔNG bỏ qua bản ghi xoá mềm — phải tra kèm `withDeleted` và phân biệt
   * 2 tình huống, thay vì để MySQL ném `ER_DUP_ENTRY` thành lỗi 500. Cùng pattern `material-type`.
   */
  private async assertCodeIsFree(code: string): Promise<void> {
    const existed = await this.unitRepository.findOne({ where: { code }, withDeleted: true });
    if (!existed) return;
    throw new UnitException(
      existed.deletedAt
        ? UnitValidation.UNIT_CODE_RESERVED_BY_DELETED
        : UnitValidation.UNIT_CODE_DOES_EXIST,
    );
  }

  private async assertNameIsFree(name: string): Promise<void> {
    const existed = await this.unitRepository.findOneBy({ name });
    if (existed) throw new UnitException(UnitValidation.UNIT_NAME_DOES_EXIST);
  }
}
