import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { CreateStoreRequestDto, StoreResponseDto, UpdateStoreRequestDto } from './store.dto';
import { Store } from './store.entity';
import { baseMapper } from 'src/app/base.mapper';
import { versionedMapper } from 'src/app/versioned.mapper';

/**
 * Chuẩn hoá dùng chung cho cả 2 map Create/Update -> Entity. Automapper KHÔNG kế thừa map của DTO
 * cha, nên `UpdateStoreRequestDto extends CreateStoreRequestDto` vẫn phải khai map riêng.
 */
const normalizeStore = <T extends CreateStoreRequestDto>() =>
  [
    forMember<T, Store>(
      (d) => d.name,
      mapFrom((s) => s.name?.trim()),
    ),
    // `code` là khoá nghiệp vụ unique -> upper-case ngay tại đây để `st-hn-01` và `ST-HN-01` va nhau
    // ở tầng check trùng, thay vì lọt xuống DB thành 2 bản ghi khác nhau.
    forMember<T, Store>(
      (d) => d.code,
      mapFrom((s) => s.code?.trim().toUpperCase()),
    ),
    forMember<T, Store>(
      (d) => d.legalName,
      mapFrom((s) => s.legalName?.trim()),
    ),
    // `taxCode` CHỈ trim, không upper-case: toàn chữ số + gạch ngang nên uppercase vô nghĩa.
    forMember<T, Store>(
      (d) => d.taxCode,
      mapFrom((s) => s.taxCode?.trim()),
    ),
    forMember<T, Store>(
      (d) => d.invoiceAddress,
      mapFrom((s) => s.invoiceAddress?.trim()),
    ),
    forMember<T, Store>(
      (d) => d.phonenumber,
      mapFrom((s) => s.phonenumber?.trim()),
    ),
    forMember<T, Store>(
      (d) => d.email,
      mapFrom((s) => s.email?.trim().toLowerCase()),
    ),
    forMember<T, Store>(
      (d) => d.address,
      mapFrom((s) => s.address?.trim()),
    ),
  ] as const;

@Injectable()
export class StoreProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        Store,
        StoreResponseDto,
        extend(baseMapper(mapper)),
        versionedMapper(),
        // Flatten quan hệ 1-1 `warehouse` (giống `WarehouseResponseDto.managerSlug`) — chỉ ra
        // `slug`/`name`, không trả nguyên entity `Warehouse` ra response.
        forMember(
          (d) => d.warehouseSlug,
          mapFrom((s) => s.warehouse?.slug),
        ),
        forMember(
          (d) => d.warehouseName,
          mapFrom((s) => s.warehouse?.name),
        ),
      );

      createMap(mapper, CreateStoreRequestDto, Store, ...normalizeStore<CreateStoreRequestDto>());

      createMap(mapper, UpdateStoreRequestDto, Store, ...normalizeStore<UpdateStoreRequestDto>());
    };
  }
}
