import { forMember, mapFrom, MappingConfiguration } from '@automapper/core';

interface VersionedLike {
  version: number;
}

// Dùng kèm baseMapper() khi map Entity (extends VersionedBase) -> ResponseDto (extends VersionedResponseDto).
export function versionedMapper<
  TSource extends VersionedLike,
  TDestination extends VersionedLike,
>(): MappingConfiguration<TSource, TDestination> {
  return forMember(
    (d) => d.version,
    mapFrom((s) => s.version),
  );
}
