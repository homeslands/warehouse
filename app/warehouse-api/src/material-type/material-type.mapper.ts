import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateMaterialTypeRequestDto,
  MaterialTypeResponseDto,
  UpdateMaterialTypeRequestDto,
} from './material-type.dto';
import { MaterialType } from './material-type.entity';
import { baseMapper } from 'src/app/base.mapper';
import { versionedMapper } from 'src/app/versioned.mapper';
import { normalizeCode } from 'src/shared/utils/code.util';

/**
 * Automapper KHÔNG kế thừa map của DTO cha, nên `UpdateMaterialTypeRequestDto extends
 * CreateMaterialTypeRequestDto` vẫn phải khai map riêng — dùng chung hàm này cho cả 2.
 */
const normalizeMaterialType = <T extends Partial<CreateMaterialTypeRequestDto>>() =>
  [
    forMember<T, MaterialType>(
      (d) => d.name,
      mapFrom((s) => s.name?.trim()),
    ),
    // `code` là khoá nghiệp vụ unique -> upper-case ngay tại đây để `mt-01` và `MT-01` va nhau ở
    // tầng check trùng, thay vì lọt xuống DB thành 2 bản ghi khác nhau.
    forMember<T, MaterialType>(
      (d) => d.code,
      mapFrom((s) => normalizeCode(s.code)),
    ),
    forMember<T, MaterialType>(
      (d) => d.description,
      mapFrom((s) => s.description?.trim()),
    ),
  ] as const;

@Injectable()
export class MaterialTypeProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        MaterialType,
        MaterialTypeResponseDto,
        extend(baseMapper(mapper)),
        versionedMapper(),
      );

      createMap(
        mapper,
        CreateMaterialTypeRequestDto,
        MaterialType,
        ...normalizeMaterialType<CreateMaterialTypeRequestDto>(),
      );

      createMap(
        mapper,
        UpdateMaterialTypeRequestDto,
        MaterialType,
        ...normalizeMaterialType<UpdateMaterialTypeRequestDto>(),
      );
    };
  }
}
