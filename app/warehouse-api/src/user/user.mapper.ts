import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, extend, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import { CreateUserRequestDto, UpdateUserRequestDto, UserResponseDto } from './user.dto';
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
        forMember(
          (d) => d.role,
          mapFrom((s) =>
            s.role
              ? {
                  slug: s.role.slug,
                  name: s.role.name,
                  description: s.role.description,
                  level: s.role.level,
                }
              : undefined,
          ),
        ),
        // `undefined` khi relation chưa nạp, để không trả `[]` sai lệch là "không thuộc kho nào".
        // Member/kho đã xoá mềm đã bị TypeORM loại khỏi join; lọc thêm `warehouse` null cho chắc.
        forMember(
          (d) => d.warehouses,
          mapFrom((s) =>
            s.warehouseMembers
              ?.filter((member) => member.warehouse)
              .map(({ warehouse }) => ({
                slug: warehouse.slug,
                code: warehouse.code,
                name: warehouse.name,
              })),
          ),
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

      // `PartialType`/`OmitType` không mang theo metadata `@AutoMap()` của DTO cha (map tự động ra
      // object rỗng) — phải khai từng field. Field vắng mặt ra `undefined` cho `pickDefined` lọc.
      createMap(
        mapper,
        UpdateUserRequestDto,
        User,
        forMember(
          (d) => d.phonenumber,
          mapFrom((s) => s.phonenumber?.trim()),
        ),
        forMember(
          (d) => d.firstName,
          mapFrom((s) => s.firstName),
        ),
        forMember(
          (d) => d.lastName,
          mapFrom((s) => s.lastName),
        ),
        forMember(
          (d) => d.dob,
          mapFrom((s) => s.dob),
        ),
        forMember(
          (d) => d.email,
          mapFrom((s) => s.email),
        ),
        forMember(
          (d) => d.address,
          mapFrom((s) => s.address),
        ),
      );
    };
  }
}
