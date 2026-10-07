import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { InventoryHistoryResponseDto, InventoryResponseDto } from './inventory.dto';
import { Inventory } from './inventory.entity';
import { InventoryHistory } from './inventory-history.entity';
import { effectiveMaximum, effectiveMinimum } from './inventory.util';
import { baseMapper } from 'src/app/base.mapper';
import { roundToScale } from 'src/shared/utils/decimal.transformer';

@Injectable()
export class InventoryProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      // Không có map chiều DTO -> Entity: `warehouse`/`material` là quan hệ do service resolve,
      // còn `quantity`/ngưỡng thì service gán tay theo từng luồng (gán mới / sửa ngưỡng / adjust).
      createMap(
        mapper,
        Inventory,
        InventoryResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.availableQuantity,
          mapFrom((s) => roundToScale(s.quantity - (s.reservedQuantity ?? 0))),
        ),
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

      createMap(
        mapper,
        InventoryHistory,
        InventoryHistoryResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.note,
          mapFrom((s) => s.note ?? null),
        ),
        forMember(
          (d) => d.changedBySlug,
          mapFrom((s) => s.changedBy?.slug),
        ),
        forMember(
          (d) => d.changedByName,
          mapFrom((s) =>
            s.changedBy ? `${s.changedBy.lastName} ${s.changedBy.firstName}`.trim() : undefined,
          ),
        ),
      );
    };
  }
}
