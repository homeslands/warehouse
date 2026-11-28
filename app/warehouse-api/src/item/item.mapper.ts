import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { ItemResponseDto } from './item.dto';
import { Item } from './item.entity';
import { ITEM_ON_HAND_STATUSES } from './item.constants';
import { baseMapper } from 'src/app/base.mapper';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { MaterialType } from 'src/material-type/material-type.entity';
import { MaterialTypeResponseDto } from 'src/material-type/material-type.dto';
import { Unit } from 'src/unit/unit.entity';
import { UnitResponseDto } from 'src/unit/unit.dto';

@Injectable()
export class ItemProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        Item,
        ItemResponseDto,
        extend(baseMapper(mapper)),
        // `PENDING`/`VOID`/đã xuất: `remaining` vẫn có số nhưng không phiếu xuất nào lấy được.
        forMember(
          (d) => d.availableQuantity,
          mapFrom((s) =>
            ITEM_ON_HAND_STATUSES.includes(s.status)
              ? roundToScale(s.remainingQuantity - (s.reservedQuantity ?? 0))
              : 0,
          ),
        ),
        forMember(
          (d) => d.unitSlug,
          mapFrom((s) => s.unit?.slug),
        ),
        forMember(
          (d) => d.materialSlug,
          mapFrom((s) => s.material?.slug),
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
          mapFrom((s) => s.importForm?.slug),
        ),
        forMember(
          (d) => d.importFormCode,
          mapFrom((s) => s.importForm?.code),
        ),
      );
    };
  }
}
