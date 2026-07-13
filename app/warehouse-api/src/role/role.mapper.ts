import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { Role } from './role.entity';
import { RoleResponseDto } from './role.dto';
import { baseMapper } from 'src/app/base.mapper';

@Injectable()
export class RoleProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        Role,
        RoleResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.authorityCodes,
          mapFrom((s) =>
            (s.permissions ?? [])
              .map((permission) => permission.authority?.code)
              .filter((code): code is string => Boolean(code)),
          ),
        ),
      );
    };
  }
}
