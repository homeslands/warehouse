import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateSupplierRequestDto,
  SupplierMaterialResponseDto,
  SupplierResponseDto,
  SupplierTransactionResponseDto,
  UpdateSupplierRequestDto,
} from './supplier.dto';
import { Supplier } from './supplier.entity';
import { SupplierTransaction } from './supplier-transaction.entity';
import { Material } from 'src/material/material.entity';
import { baseMapper } from 'src/app/base.mapper';

/**
 * Chuẩn hoá dùng chung cho cả 2 map Create/Update -> Entity. Automapper KHÔNG kế thừa map của DTO
 * cha, nên `UpdateSupplierRequestDto` vẫn phải khai map riêng. Các `mapFrom` đều dùng `?.` nên field
 * vắng mặt map ra `undefined` và bị `pickDefined` lọc bỏ ở service.
 */
const normalizeSupplier = <T extends Partial<CreateSupplierRequestDto>>() =>
  [
    // `code` là khoá nghiệp vụ unique -> upper-case để `ncc-01` và `NCC-01` va nhau ở tầng check trùng.
    forMember<T, Supplier>(
      (d) => d.code,
      mapFrom((s) => s.code?.trim().toUpperCase()),
    ),
    forMember<T, Supplier>(
      (d) => d.name,
      mapFrom((s) => s.name?.trim()),
    ),
    forMember<T, Supplier>(
      (d) => d.taxCode,
      mapFrom((s) => s.taxCode?.trim()),
    ),
    forMember<T, Supplier>(
      (d) => d.phonenumber,
      mapFrom((s) => s.phonenumber?.trim()),
    ),
    forMember<T, Supplier>(
      (d) => d.email,
      mapFrom((s) => s.email?.trim().toLowerCase()),
    ),
    forMember<T, Supplier>(
      (d) => d.address,
      mapFrom((s) => s.address?.trim()),
    ),
    forMember<T, Supplier>(
      (d) => d.contactPerson,
      mapFrom((s) => s.contactPerson?.trim()),
    ),
  ] as const;

@Injectable()
export class SupplierProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, Supplier, SupplierResponseDto, extend(baseMapper(mapper)));

      createMap(
        mapper,
        Material,
        SupplierMaterialResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.typeSlug,
          mapFrom((s) => s.type?.slug),
        ),
        forMember(
          (d) => d.typeName,
          mapFrom((s) => s.type?.name),
        ),
        forMember(
          (d) => d.baseUnitSlug,
          mapFrom((s) => s.baseUnit?.slug),
        ),
        forMember(
          (d) => d.baseUnitName,
          mapFrom((s) => s.baseUnit?.name),
        ),
      );

      createMap(
        mapper,
        SupplierTransaction,
        SupplierTransactionResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.materialSlug,
          mapFrom((s) => s.material?.slug),
        ),
        forMember(
          (d) => d.materialCode,
          mapFrom((s) => s.material?.code),
        ),
        forMember(
          (d) => d.materialName,
          mapFrom((s) => s.material?.name),
        ),
        // Cột nullable: `null` từ DB phải ra `undefined` để response không mang `quantity: null`
        // lẫn lộn với field không có ở giao dịch PAYMENT.
        forMember(
          (d) => d.quantity,
          mapFrom((s) => s.quantity ?? undefined),
        ),
        forMember(
          (d) => d.unitPrice,
          mapFrom((s) => s.unitPrice ?? undefined),
        ),
        forMember(
          (d) => d.transactionDate,
          mapFrom((s) => s.transactionDate?.toISOString()),
        ),
        forMember(
          (d) => d.performedBySlug,
          mapFrom((s) => s.performedBy?.slug),
        ),
        forMember(
          (d) => d.performedByName,
          mapFrom((s) =>
            s.performedBy
              ? `${s.performedBy.lastName} ${s.performedBy.firstName}`.trim()
              : undefined,
          ),
        ),
      );

      createMap(
        mapper,
        CreateSupplierRequestDto,
        Supplier,
        ...normalizeSupplier<CreateSupplierRequestDto>(),
      );

      createMap(
        mapper,
        UpdateSupplierRequestDto,
        Supplier,
        ...normalizeSupplier<UpdateSupplierRequestDto>(),
      );
    };
  }
}
