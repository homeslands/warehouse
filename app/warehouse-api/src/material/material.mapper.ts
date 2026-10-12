import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateMaterialRequestDto,
  MaterialConversionUnitResponseDto,
  MaterialResponseDto,
  UpdateMaterialRequestDto,
} from './material.dto';
import { Material } from './material.entity';
import { MaterialUnit } from './material-unit.entity';
import { baseMapper } from 'src/app/base.mapper';
import { normalizeCode } from 'src/shared/utils/code.util';
import { MaterialType } from 'src/material-type/material-type.entity';
import { MaterialTypeResponseDto } from 'src/material-type/material-type.dto';
import { Unit } from 'src/unit/unit.entity';
import { UnitResponseDto } from 'src/unit/unit.dto';
import { Supplier } from 'src/supplier/supplier.entity';
import { SupplierResponseDto } from 'src/supplier/supplier.dto';

/**
 * Automapper KHÔNG kế thừa map của DTO cha — `UpdateMaterialRequestDto extends
 * CreateMaterialRequestDto` vẫn phải khai map riêng.
 *
 * `typeSlug`/`baseUnitSlug` cố tình KHÔNG map sang entity: quan hệ `type`/`baseUnit` do service
 * resolve ra entity thật rồi gán, mapper mà tự đụng vào sẽ ghi đè thành `undefined`.
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
        // Object lồng map qua profile của module tương ứng (MaterialType/Unit/Supplier) — các profile
        // đó phải được đăng ký cùng mapper, thiếu là automapper ném lỗi "mapping not found".
        forMember(
          (d) => d.type,
          mapFrom((s) =>
            s.type ? mapper.map(s.type, MaterialType, MaterialTypeResponseDto) : undefined,
          ),
        ),
        forMember(
          (d) => d.baseUnit,
          mapFrom((s) => (s.baseUnit ? mapper.map(s.baseUnit, Unit, UnitResponseDto) : null)),
        ),
        // `supplier` cần `relations: { supplier: true }` ở read path — thiếu thì mọi vật tư đều ra
        // `hasSupplier: false`.
        forMember(
          (d) => d.hasSupplier,
          mapFrom((s) => !!s.supplier),
        ),
        forMember(
          (d) => d.supplier,
          mapFrom((s) =>
            s.supplier ? mapper.map(s.supplier, Supplier, SupplierResponseDto) : null,
          ),
        ),
      );

      // Dòng bảng join -> DTO phẳng. `unit` phải được load (`relations: { unit: true }`), thiếu là
      // 3 field `unit*` im lặng ra `undefined`.
      createMap(
        mapper,
        MaterialUnit,
        MaterialConversionUnitResponseDto,
        forMember(
          (d) => d.unitSlug,
          mapFrom((s) => s.unit?.slug),
        ),
        forMember(
          (d) => d.unitCode,
          mapFrom((s) => s.unit?.code),
        ),
        forMember(
          (d) => d.unitName,
          mapFrom((s) => s.unit?.name),
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
