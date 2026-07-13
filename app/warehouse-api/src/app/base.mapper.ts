import { createMap, Mapper, Mapping, typeConverter } from '@automapper/core';
import { Base } from './base.entity';
import { BaseResponseDto } from './base.dto';

// slug/createdAt/updatedAt dùng chung cho mọi Entity -> ResponseDto. Đăng ký 1 lần ở đây,
// mỗi module extend(baseMapper(mapper)) thay vì lặp lại typeConverter Date -> string.
// Cố tình không map field `id` — response không bao giờ lộ id (uuid PK) thật ra ngoài,
// `slug` là định danh public duy nhất (xem CLAUDE.md mục "Automapper").
export const baseMapper = (mapper: Mapper): Mapping<Base, BaseResponseDto> => {
  return createMap(
    mapper,
    Base,
    BaseResponseDto,
    typeConverter(Date, String, (createdAt) => createdAt?.toString()),
    typeConverter(Date, String, (updatedAt) => updatedAt?.toString()),
  );
};
