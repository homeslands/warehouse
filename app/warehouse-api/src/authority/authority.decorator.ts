import { SetMetadata } from '@nestjs/common';
import { TAuthorityCode } from './authority.constants';

export const REQUIRE_AUTHORITY_KEY = 'requireAuthority';

/**
 * Chỉ nhận `code` đã khai trong `AuthorityCode`, không nhận chuỗi tuỳ ý: 1 `code` không có trong DB
 * làm guard chặn mọi role (trừ `SUPER_ADMIN`) mà không báo lỗi gì, nên phải bắt được lúc compile.
 *
 * Truyền nhiều `code` là AND — role phải có ĐỦ tất cả. Dùng cho route nối 2 tài nguyên (vd gán vật
 * tư vào kho = `MATERIAL_UPDATE` + `WAREHOUSE_UPDATE`) thay vì đẻ thêm authority riêng cho phần nối.
 * Luôn lưu metadata dạng mảng. Rỗng là lỗi compile.
 */
export const RequireAuthority = (...codes: [TAuthorityCode, ...TAuthorityCode[]]) =>
  SetMetadata(REQUIRE_AUTHORITY_KEY, codes);
