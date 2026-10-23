import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateExportFormRequestDto,
  ExportFormItemResponseDto,
  ExportFormResponseDto,
  UpdateExportFormRequestDto,
} from './export-form.dto';
import { ExportForm } from './export-form.entity';
import { ExportFormItem } from './export-form-item.entity';
import { baseMapper } from 'src/app/base.mapper';
import { versionedMapper } from 'src/app/versioned.mapper';
import { normalizeCode } from 'src/shared/utils/code.util';

/**
 * Dùng chung cho Create/Update -> Entity (automapper không kế thừa map của DTO cha). Mọi `mapFrom`
 * dùng `?.` ⇒ field vắng mặt ra `undefined` và bị `pickDefined` lọc ở service. `items`/`totalAmount`
 * không map: service tự dựng.
 */
const normalizeExportForm = <T extends Partial<CreateExportFormRequestDto>>() =>
  [
    forMember<T, ExportForm>(
      (d) => d.code,
      mapFrom((s) => normalizeCode(s.code)),
    ),
    forMember<T, ExportForm>(
      (d) => d.type,
      mapFrom((s) => s.type),
    ),
    forMember<T, ExportForm>(
      (d) => d.purchaseOrder,
      mapFrom((s) => s.purchaseOrder?.trim()),
    ),
    forMember<T, ExportForm>(
      (d) => d.invoiceCode,
      mapFrom((s) => s.invoiceCode?.trim()),
    ),
    forMember<T, ExportForm>(
      (d) => d.receiver,
      mapFrom((s) => s.receiver?.trim()),
    ),
    forMember<T, ExportForm>(
      (d) => d.file,
      mapFrom((s) => s.file?.trim()),
    ),
    forMember<T, ExportForm>(
      (d) => d.note,
      mapFrom((s) => s.note?.trim()),
    ),
  ] as const;

@Injectable()
export class ExportFormProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        ExportFormItem,
        ExportFormItemResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.materialSlug,
          mapFrom((s) => s.material?.slug),
        ),
        forMember(
          (d) => d.unitSlug,
          mapFrom((s) => s.unit?.slug),
        ),
        forMember(
          (d) => d.batchSlug,
          mapFrom((s) => s.batch?.slug ?? null),
        ),
        forMember(
          (d) => d.batchExpiryDate,
          mapFrom((s) => s.batch?.expiryDate ?? null),
        ),
      );

      createMap(
        mapper,
        ExportForm,
        ExportFormResponseDto,
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
              ? mapper.mapArray(s.items, ExportFormItem, ExportFormItemResponseDto)
              : undefined,
          ),
        ),
        versionedMapper(),
      );

      createMap(
        mapper,
        CreateExportFormRequestDto,
        ExportForm,
        ...normalizeExportForm<CreateExportFormRequestDto>(),
      );
      createMap(
        mapper,
        UpdateExportFormRequestDto,
        ExportForm,
        ...normalizeExportForm<UpdateExportFormRequestDto>(),
      );
    };
  }
}
