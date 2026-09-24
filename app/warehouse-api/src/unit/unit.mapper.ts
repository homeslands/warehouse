import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { CreateUnitRequestDto, UnitResponseDto, UpdateUnitRequestDto } from './unit.dto';
import { Unit } from './unit.entity';
import { baseMapper } from 'src/app/base.mapper';
import { normalizeCode } from 'src/shared/utils/code.util';

/**
 * Automapper KHÔNG kế thừa map của DTO cha, nên `UpdateUnitRequestDto extends CreateUnitRequestDto`
 * vẫn phải khai map riêng — dùng chung hàm này cho cả 2.
 */
const normalizeUnit = <T extends Partial<CreateUnitRequestDto>>() =>
  [
    forMember<T, Unit>(
      (d) => d.name,
      mapFrom((s) => s.name?.trim()),
    ),
    // `code` là khoá nghiệp vụ unique -> upper-case ngay tại đây để `kg` và `KG` va nhau ở tầng
    // check trùng, thay vì lọt xuống DB thành 2 bản ghi khác nhau.
    forMember<T, Unit>(
      (d) => d.code,
      mapFrom((s) => normalizeCode(s.code)),
    ),
    forMember<T, Unit>(
      (d) => d.description,
      mapFrom((s) => s.description?.trim()),
    ),
  ] as const;

@Injectable()
export class UnitProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, Unit, UnitResponseDto, extend(baseMapper(mapper)));

      createMap(mapper, CreateUnitRequestDto, Unit, ...normalizeUnit<CreateUnitRequestDto>());

      createMap(mapper, UpdateUnitRequestDto, Unit, ...normalizeUnit<UpdateUnitRequestDto>());
    };
  }
}
