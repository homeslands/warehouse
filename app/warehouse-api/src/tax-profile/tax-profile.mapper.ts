import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { TaxProfileResponseDto } from './tax-profile.dto';
import { TaxProfile } from './tax-profile.entity';
import { baseMapper } from 'src/app/base.mapper';

@Injectable()
export class TaxProfileProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      // Không `versionedMapper()`: entity kế thừa `Base`, không phải `VersionedBase`.
      // Không map chiều DTO -> Entity: dữ liệu vào bảng này đến từ upstream, không từ request body.
      createMap(mapper, TaxProfile, TaxProfileResponseDto, extend(baseMapper(mapper)));
    };
  }
}
