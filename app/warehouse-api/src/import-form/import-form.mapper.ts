import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateImportFormRequestDto,
  ImportFormResponseDto,
  UpdateImportFormRequestDto,
} from './import-form.dto';
import { ImportForm } from './import-form.entity';
import { baseMapper } from 'src/app/base.mapper';
import { versionedMapper } from 'src/app/versioned.mapper';
import { normalizeCode } from 'src/shared/utils/code.util';

/**
 * Dùng chung cho cả 2 map Create/Update -> Entity. Automapper KHÔNG kế thừa map của DTO cha, nên
 * `UpdateImportFormRequestDto` (partial của Create) phải khai đủ từng field ở đây — field nào thiếu
 * là PATCH âm thầm bỏ qua field đó. Mọi `mapFrom` dùng `?.` ⇒ field vắng mặt ra `undefined` và bị
 * `pickDefined` lọc ở service.
 *
 * `supplierSlug` cố tình KHÔNG map: service resolve nhà cung cấp rồi chép snapshot.
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
      (d) => d.total,
      mapFrom((s) => s.total),
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
