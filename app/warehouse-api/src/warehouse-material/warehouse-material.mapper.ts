import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { WarehouseMaterialResponseDto } from './warehouse-material.dto';
import { WarehouseMaterial } from './warehouse-material.entity';
import { effectiveMaximum, effectiveMinimum } from './warehouse-material.util';
import { baseMapper } from 'src/app/base.mapper';

@Injectable()
export class WarehouseMaterialProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      // Không có map chiều DTO -> Entity: `warehouse`/`material` là quan hệ do service resolve,
      // còn `quantity`/ngưỡng thì service gán tay theo từng luồng (gán mới / sửa ngưỡng / adjust).
      createMap(
        mapper,
        WarehouseMaterial,
        WarehouseMaterialResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.minimumInventory,
          mapFrom((s) => s.minimumInventory ?? null),
        ),
        forMember(
          (d) => d.maximumInventory,
          mapFrom((s) => s.maximumInventory ?? null),
        ),
        forMember(
          (d) => d.effectiveMinimumInventory,
          mapFrom((s) => effectiveMinimum(s)),
        ),
        forMember(
          (d) => d.effectiveMaximumInventory,
          mapFrom((s) => effectiveMaximum(s)),
        ),
        forMember(
          (d) => d.isBelowMinimum,
          mapFrom((s) => s.quantity < effectiveMinimum(s)),
        ),
        forMember(
          (d) => d.isAboveMaximum,
          mapFrom((s) => s.quantity > effectiveMaximum(s)),
        ),
        forMember(
          (d) => d.warehouseSlug,
          mapFrom((s) => s.warehouse?.slug),
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
        forMember(
          (d) => d.typeSlug,
          mapFrom((s) => s.material?.type?.slug),
        ),
        forMember(
          (d) => d.typeName,
          mapFrom((s) => s.material?.type?.name),
        ),
      );
    };
  }
}
