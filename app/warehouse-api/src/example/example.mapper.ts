import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateExampleRequestDto,
  ExampleResponseDto,
  UpdateExampleRequestDto,
} from './example.dto';
import { Example } from './example.entity';
import { baseMapper } from 'src/app/base.mapper';

@Injectable()
export class ExampleProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, Example, ExampleResponseDto, extend(baseMapper(mapper)));

      createMap(
        mapper,
        CreateExampleRequestDto,
        Example,
        forMember(
          (d) => d.name,
          mapFrom((s) => s.name?.trim()),
        ),
      );

      createMap(
        mapper,
        UpdateExampleRequestDto,
        Example,
        forMember(
          (d) => d.name,
          mapFrom((s) => s.name?.trim()),
        ),
      );
    };
  }
}
