import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateMaterialRequestDto,
  MaterialResponseDto,
  UpdateMaterialRequestDto,
} from './material.dto';
import { Material } from './material.entity';
import { baseMapper } from 'src/app/base.mapper';
import { versionedMapper } from 'src/app/versioned.mapper';
import { normalizeCode } from 'src/shared/utils/code.util';

/**
 * Automapper KHÔNG kế thừa map của DTO cha — `UpdateMaterialRequestDto extends
 * CreateMaterialRequestDto` vẫn phải khai map riêng.
 *
 * `typeSlug` cố tình KHÔNG map sang entity: quan hệ `type` do service resolve ra entity thật rồi
 * gán, mapper mà tự đụng vào sẽ ghi đè thành `undefined`.
 */
const normalizeMaterial = <T extends Partial<CreateMaterialRequestDto>>() =>
  [
    forMember<T, Material>(
      (d) => d.code,
      mapFrom((s) => normalizeCode(s.code)),
    ),
    forMember<T, Material>(
      (d) => d.name,
      mapFrom((s) => s.name?.trim()),
    ),
  ] as const;

/**
 * Ngưỡng tồn phải map KHÁC nhau giữa Create và Update, nên tách riêng khỏi `normalizeMaterial`:
 *
 * - Create: thiếu ngưỡng ⇒ mặc định `0`.
 * - Update (PATCH): thiếu ngưỡng ⇒ phải ra `undefined` để `pickDefined` lọc bỏ và giá trị cũ trong
 *   DB được giữ nguyên. Dùng chung `?? 0` như Create thì mọi PATCH không nhắc tới ngưỡng sẽ âm thầm
 *   reset cả 2 về 0.
 */
const inventoryDefaults = <T extends Partial<CreateMaterialRequestDto>>() =>
  [
    forMember<T, Material>(
      (d) => d.minimumInventory,
      mapFrom((s) => s.minimumInventory ?? 0),
    ),
    forMember<T, Material>(
      (d) => d.maximumInventory,
      mapFrom((s) => s.maximumInventory ?? 0),
    ),
  ] as const;

const inventoryPassthrough = <T extends Partial<CreateMaterialRequestDto>>() =>
  [
    forMember<T, Material>(
      (d) => d.minimumInventory,
      mapFrom((s) => s.minimumInventory),
    ),
    forMember<T, Material>(
      (d) => d.maximumInventory,
      mapFrom((s) => s.maximumInventory),
    ),
  ] as const;

@Injectable()
export class MaterialProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        Material,
        MaterialResponseDto,
        extend(baseMapper(mapper)),
        versionedMapper(),
        forMember(
          (d) => d.typeSlug,
          mapFrom((s) => s.type?.slug),
        ),
        forMember(
          (d) => d.typeCode,
          mapFrom((s) => s.type?.code),
        ),
        forMember(
          (d) => d.typeName,
          mapFrom((s) => s.type?.name),
        ),
      );

      createMap(
        mapper,
        CreateMaterialRequestDto,
        Material,
        ...normalizeMaterial<CreateMaterialRequestDto>(),
        ...inventoryDefaults<CreateMaterialRequestDto>(),
      );

      createMap(
        mapper,
        UpdateMaterialRequestDto,
        Material,
        ...normalizeMaterial<UpdateMaterialRequestDto>(),
        ...inventoryPassthrough<UpdateMaterialRequestDto>(),
      );
    };
  }
}
