import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateImportFormRequestDto,
  ImportFormItemGroupResponseDto,
  ImportFormItemResponseDto,
  ImportFormResponseDto,
  UpdateImportFormRequestDto,
} from './import-form.dto';
import { ImportForm } from './import-form.entity';
import { Item } from 'src/item/item.entity';
import { baseMapper } from 'src/app/base.mapper';
import { versionedMapper } from 'src/app/versioned.mapper';
import { roundToScale } from 'src/shared/utils/decimal.transformer';
import { roundMoney } from 'src/shared/utils/decimal.util';

/**
 * Gộp item (1 item = 1 dòng = 1 đơn vị hàng) theo (vật tư, đơn vị, đơn giá) cho bảng phiếu — giữ thứ tự lần
 * xuất hiện đầu tiên. `items` phải đã xếp theo `lineNo`.
 */
export const groupImportFormItems = (items: Item[]): ImportFormItemGroupResponseDto[] => {
  const groups = new Map<string, ImportFormItemGroupResponseDto>();
  for (const item of items) {
    const key = `${item.material?.id}|${item.unit?.id}|${item.unitPrice}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        materialSlug: item.material?.slug,
        materialCode: item.materialCode,
        materialName: item.materialName,
        unitSlug: item.unit?.slug,
        unitCode: item.unitCode,
        unitName: item.unitName,
        unitPrice: item.unitPrice,
        quantity: 0,
        baseQuantity: 0,
        amount: 0,
        codes: [],
      };
      groups.set(key, group);
    }
    group.quantity = roundToScale(group.quantity + item.quantity);
    group.baseQuantity = roundToScale(group.baseQuantity + item.baseQuantity);
    group.amount = roundMoney(group.amount + item.amount);
    if (item.code) group.codes.push(item.code);
  }
  return [...groups.values()];
};

/**
 * Dùng chung cho cả 2 map Create/Update -> Entity. Automapper KHÔNG kế thừa map của DTO cha, nên
 * `UpdateImportFormRequestDto` (partial của Create) phải khai đủ từng field ở đây — field nào thiếu
 * là PATCH âm thầm bỏ qua field đó. Mọi `mapFrom` dùng `?.` ⇒ field vắng mặt ra `undefined` và bị
 * `pickDefined` lọc ở service.
 *
 * Body không có dòng: dòng thêm/gỡ qua `POST`/`DELETE .../items`. `total` không có trong body —
 * service tính từ các dòng.
 */
const normalizeImportForm = <T extends Partial<CreateImportFormRequestDto>>() =>
  [
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
        Item,
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
            s.items ? mapper.mapArray(s.items, Item, ImportFormItemResponseDto) : undefined,
          ),
        ),
        forMember(
          (d) => d.groups,
          mapFrom((s) => (s.items ? groupImportFormItems(s.items) : undefined)),
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
