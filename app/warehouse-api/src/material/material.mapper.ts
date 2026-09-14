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
const normalizeMaterial = <T extends CreateMaterialRequestDto>() =>
  [
    forMember<T, Material>(
      (d) => d.code,
      mapFrom((s) => normalizeCode(s.code)),
    ),
    forMember<T, Material>(
      (d) => d.name,
      mapFrom((s) => s.name?.trim()),
    ),
    forMember<T, Material>(
      (d) => d.minimumInventory,
      mapFrom((s) => s.minimumInventory ?? 0),
    ),
    forMember<T, Material>(
      (d) => d.maximumInventory,
      mapFrom((s) => s.maximumInventory ?? 0),
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
      );

      createMap(
        mapper,
        UpdateMaterialRequestDto,
        Material,
        ...normalizeMaterial<UpdateMaterialRequestDto>(),
      );
    };
  }
}
