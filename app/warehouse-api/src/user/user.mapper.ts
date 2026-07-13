import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { CreateUserRequestDto, UserResponseDto } from './user.dto';
import { User } from './user.entity';
import { baseMapper } from 'src/app/base.mapper';

@Injectable()
export class UserProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(
        mapper,
        User,
        UserResponseDto,
        extend(baseMapper(mapper)),
        forMember(
          (d) => d.roleSlug,
          mapFrom((s) => s.role?.slug),
        ),
        forMember(
          (d) => d.roleName,
          mapFrom((s) => s.role?.name),
        ),
      );

      createMap(
        mapper,
        CreateUserRequestDto,
        User,
        forMember(
          (d) => d.phonenumber,
          mapFrom((s) => s.phonenumber?.trim()),
        ),
      );
    };
  }
}
