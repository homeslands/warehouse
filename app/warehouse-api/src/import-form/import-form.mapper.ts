import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateImportFormRequestDto,
  ImportFormItemResponseDto,
  ImportFormResponseDto,
  UpdateImportFormRequestDto,
} from './import-form.dto';
import { ImportForm } from './import-form.entity';
import { ImportFormItem } from './import-form-item.entity';
import { baseMapper } from 'src/app/base.mapper';
import { versionedMapper } from 'src/app/versioned.mapper';
import { normalizeCode } from 'src/shared/utils/code.util';

/**
 * Dùng chung cho cả 2 map Create/Update -> Entity. Automapper KHÔNG kế thừa map của DTO cha, nên
 * `UpdateImportFormRequestDto` (partial của Create) phải khai đủ từng field ở đây — field nào thiếu
 * là PATCH âm thầm bỏ qua field đó. Mọi `mapFrom` dùng `?.` ⇒ field vắng mặt ra `undefined` và bị
 * `pickDefined` lọc ở service.
 *
 * `items` cố tình KHÔNG map: service resolve vật tư/đơn vị (kèm nhà cung cấp của vật tư) rồi tự dựng
 * snapshot + dòng phiếu. `total` không có trong body — service tính từ `items`.
 */
const normalizeImportForm = <T extends Partial<CreateImportFormRequestDto>>() =>
  [
    // `code` unique ⇒ upper-case ngay tại đây để `pn-01` và `PN-01` va nhau ở tầng check trùng.
    forMember<T, ImportForm>(
      (d) => d.code,
      mapFrom((s) => normalizeCode(s.code)),
    ),
    forMember<T, ImportForm>(
      (d) => d.purchaseOrder,
      mapFrom((s) => s.purchaseOrder?.trim()),
    ),
    forMember<T, ImportForm>(
      (d) => d.invoiceCode,
      mapFrom((s) => s.invoiceCode?.trim()),
    ),
    forMember<T, ImportForm>(
      (d) => d.date,
      mapFrom((s) => s.date),
    ),
    forMember<T, ImportForm>(
      (d) => d.file,
      mapFrom((s) => s.file?.trim()),
    ),
    forMember<T, ImportForm>(
      (d) => d.note,
      mapFrom((s) => s.note?.trim()),
    ),
  ] as const;

@Injectable()
export class ImportFormProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        ImportFormItem,
        ImportFormItemResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.materialSlug,
          mapFrom((s) => s.material?.slug),
        ),
        forMember(
          (d) => d.unitSlug,
          mapFrom((s) => s.unit?.slug),
        ),
      );

      createMap(
        mapper,
        ImportForm,
        ImportFormResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.requesterSlug,
          mapFrom((s) => s.requester?.slug ?? null),
        ),
        forMember(
          (d) => d.approverSlug,
          mapFrom((s) => s.approver?.slug ?? null),
        ),
        forMember(
          (d) => d.warehouseSlug,
          mapFrom((s) => s.warehouse?.slug),
        ),
        // `items` chỉ có khi đã load relation (list cố ý không load) — không load thì bỏ hẳn field.
        forMember(
          (d) => d.items,
          mapFrom((s) =>
            s.items
              ? mapper.mapArray(s.items, ImportFormItem, ImportFormItemResponseDto)
              : undefined,
          ),
        ),
        versionedMapper(),
      );

      createMap(
        mapper,
        CreateImportFormRequestDto,
        ImportForm,
        ...normalizeImportForm<CreateImportFormRequestDto>(),
      );
      createMap(
        mapper,
        UpdateImportFormRequestDto,
        ImportForm,
        ...normalizeImportForm<UpdateImportFormRequestDto>(),
      );
    };
  }
}
