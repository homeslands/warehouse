import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateWarehouseRequestDto,
  UpdateWarehouseRequestDto,
  WarehouseResponseDto,
} from './warehouse.dto';
import { Warehouse } from './warehouse.entity';
import { baseMapper } from 'src/app/base.mapper';

/**
 * Chuẩn hoá dùng chung cho cả 2 map Create/Update -> Entity. Automapper KHÔNG kế thừa map của DTO
 * cha, nên `UpdateWarehouseRequestDto` (partial của Create DTO) vẫn phải khai map riêng.
 */
const normalizeWarehouse = <T extends Partial<CreateWarehouseRequestDto>>() =>
  [
    forMember<T, Warehouse>(
      (d) => d.name,
      mapFrom((s) => s.name?.trim()),
    ),
    // `code` là khoá nghiệp vụ unique -> upper-case ngay tại đây để `wh-hn-01` và `WH-HN-01` va nhau
    // ở tầng check trùng, thay vì lọt xuống DB thành 2 bản ghi khác nhau.
    forMember<T, Warehouse>(
      (d) => d.code,
      mapFrom((s) => s.code?.trim().toUpperCase()),
    ),
    forMember<T, Warehouse>(
      (d) => d.address,
      mapFrom((s) => s.address?.trim()),
    ),
    forMember<T, Warehouse>(
      (d) => d.phonenumber,
      mapFrom((s) => s.phonenumber?.trim()),
    ),
  ] as const;

@Injectable()
export class WarehouseProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        Warehouse,
        WarehouseResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.managerSlug,
          mapFrom((s) => s.manager?.slug),
        ),
        forMember(
          (d) => d.managerPhonenumber,
          mapFrom((s) => s.manager?.phonenumber),
        ),
      );

      createMap(
        mapper,
        CreateWarehouseRequestDto,
        Warehouse,
        ...normalizeWarehouse<CreateWarehouseRequestDto>(),
      );

      createMap(
        mapper,
        UpdateWarehouseRequestDto,
        Warehouse,
        ...normalizeWarehouse<UpdateWarehouseRequestDto>(),
      );
    };
  }
}
