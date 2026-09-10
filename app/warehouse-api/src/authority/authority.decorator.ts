import { SetMetadata } from '@nestjs/common';
import { TAuthorityCode } from './authority.constants';

export const REQUIRE_AUTHORITY_KEY = 'requireAuthority';

/**
 * Chỉ nhận `code` đã khai trong `AuthorityCode`, không nhận chuỗi tuỳ ý: 1 `code` không có trong DB
 * làm guard chặn mọi role (trừ `SUPER_ADMIN`) mà không báo lỗi gì, nên phải bắt được lúc compile.
 */
export const RequireAuthority = (code: TAuthorityCode) => SetMetadata(REQUIRE_AUTHORITY_KEY, code);
