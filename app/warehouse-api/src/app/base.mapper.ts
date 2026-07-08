import { forMember, mapFrom, MappingConfiguration } from '@automapper/core';

interface BaseLike {
  id: string;
  slug: string;
}

// Field id/slug/createdAt/updatedAt đã @AutoMap() sẵn trên Base/BaseResponseDto nên
// @automapper/classes tự map theo tên thuộc tính kế thừa — hàm này chỉ tường minh hoá field id
// để tránh phụ thuộc ngầm vào hành vi kế thừa của thư viện. Luôn truyền vào createMap khi map
// Entity -> ResponseDto.
export function baseMapper<
  TSource extends BaseLike,
  TDestination extends BaseLike,
>(): MappingConfiguration<TSource, TDestination> {
  return forMember(
    (d) => d.id,
    mapFrom((s) => s.id),
  );
}
