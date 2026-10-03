import { SetMetadata } from '@nestjs/common';

export const WAREHOUSE_SCOPE_KEY = 'warehouseScope';

/**
 * Chỉ cho request đi qua nếu user hiện tại là manager hoặc member của kho có slug nằm ở route param
 * `param` — check bởi `WarehouseScopeGuard` (global, chạy sau `AuthorityGuard`). `SUPER_ADMIN` và
 * `ADMIN` bypass.
 *
 * Cộng dồn (AND) với `@RequireAuthority`: authority trả lời "role này được làm thao tác này không",
 * decorator này trả lời "user này có thuộc kho này không".
 *
 * @param param tên route param chứa slug kho. Mặc định `slug` (`/warehouses/:slug/...`).
 * @example
 * `@WarehouseScope()` — đọc `:slug`
 * `@WarehouseScope('warehouseSlug')` — đọc `:warehouseSlug`
 */
export const WarehouseScope = (param = 'slug') => SetMetadata(WAREHOUSE_SCOPE_KEY, param);
