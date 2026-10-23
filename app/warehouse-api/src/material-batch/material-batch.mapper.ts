import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { MaterialBatchResponseDto } from './material-batch.dto';
import { MaterialBatch } from './material-batch.entity';
import { baseMapper } from 'src/app/base.mapper';

@Injectable()
export class MaterialBatchProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        MaterialBatch,
        MaterialBatchResponseDto,
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
        forMember(
          (d) => d.warehouseSlug,
          mapFrom((s) => s.warehouse?.slug),
        ),
        forMember(
          (d) => d.importFormSlug,
          mapFrom((s) => s.importFormItem?.importForm?.slug ?? null),
        ),
        forMember(
          (d) => d.importFormCode,
          mapFrom((s) => s.importFormItem?.importForm?.code ?? null),
        ),
      );
    };
  }
}
