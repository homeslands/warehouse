import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { MaterialBatchResponseDto } from './material-batch.dto';
import { MaterialBatch } from './material-batch.entity';
import { baseMapper } from 'src/app/base.mapper';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { MaterialType } from 'src/material-type/material-type.entity';
import { MaterialTypeResponseDto } from 'src/material-type/material-type.dto';
import { Unit } from 'src/unit/unit.entity';
import { UnitResponseDto } from 'src/unit/unit.dto';

@Injectable()
export class MaterialBatchProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        MaterialBatch,
        MaterialBatchResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.availableQuantity,
          mapFrom((s) => roundToScale(s.remainingQuantity - (s.reservedQuantity ?? 0))),
        ),
        forMember(
          (d) => d.materialSlug,
          mapFrom((s) => s.material?.slug),
        ),
        forMember(
          (d) => d.materialCode,
          mapFrom((s) => s.material?.code),
        ),
        forMember(
          (d) => d.materialName,
          mapFrom((s) => s.material?.name),
        ),
        // `type`/`baseUnit` map qua profile của module MaterialType/Unit (cùng mapper global).
        forMember(
          (d) => d.material,
          mapFrom((s) =>
            s.material
              ? {
                  slug: s.material.slug,
                  code: s.material.code,
                  name: s.material.name,
                  type: s.material.type
                    ? mapper.map(s.material.type, MaterialType, MaterialTypeResponseDto)
                    : null,
                  baseUnit: s.material.baseUnit
                    ? mapper.map(s.material.baseUnit, Unit, UnitResponseDto)
                    : null,
                }
              : undefined,
          ),
        ),
        forMember(
          (d) => d.warehouseSlug,
          mapFrom((s) => s.warehouse?.slug),
        ),
        forMember(
          (d) => d.importFormSlug,
          mapFrom((s) => s.importFormItem?.importForm?.slug ?? null),
        ),
        forMember(
          (d) => d.importFormCode,
          mapFrom((s) => s.importFormItem?.importForm?.code ?? null),
        ),
      );
    };
  }
}
