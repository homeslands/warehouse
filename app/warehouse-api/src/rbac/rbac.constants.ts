// Key cache RBAC trên Redis (`REDIS_AUTH_DB`, cùng DB và cùng connection ioredis với key thu hồi
// token, khác prefix). Khác `auth.constants.ts`: mất key ở đây chỉ tốn 1 query DB tính lại
// (fail-open), nên đổi prefix không phải breaking change — key cũ hết TTL tự biến mất.
// Xem `docs/specs/rbac.md`.

export const RBAC_USER_KEY_PREFIX = 'rbac:user';

/**
 * Member đánh dấu "đã cache", luôn được `SADD` kèm danh sách quyền. Redis KHÔNG lưu SET rỗng, nên
 * nếu chỉ ghi quyền thì role không có quyền nào sẽ không có key ⇒ không phân biệt được "chưa cache"
 * với "đã cache, quyền rỗng" ⇒ mỗi request đều rơi xuống MySQL mà không có lỗi nào báo ra.
 *
 * Không phải trường hợp lý thuyết: `SUPER_ADMIN` cố tình không có row `permission_tbl` nào (nó
 * bypass ở `AuthorityGuard` — xem migration `1783728000011`), nên SET của tài khoản root chỉ gồm
 * đúng member này.
 *
 * `@` không bao giờ đụng `Authority.code` thật: code toàn UPPER_SNAKE và chỉ tạo được qua migration
 * (không có API tạo `Authority` — xem `CLAUDE.md`), nên đây là ràng buộc cấu trúc, không phải quy ước.
 */
export const RBAC_CACHED_MEMBER = '@cached';

export const RBAC_ROLE_KEY_PREFIX = 'rbac:role';

/**
 * Danh sách `Authority.code` của 1 role (`role_tbl ⋈ permission_tbl ⋈ authority_tbl`), TTL =
 * `RBAC_ROLE_CACHE_TTL`. Đây là lớp cache được `RbacService` hỏi TRƯỚC khi query MySQL, dùng chung
 * cho mọi user cùng role.
 *
 * STRING chứa JSON array (không phải SET như key per-user): key per-user có member `@cached` làm cờ
 * tồn tại, key này thì không có gì tương đương — mà role được cấp 0 quyền vẫn phải là 1 cache HIT,
 * còn Redis không lưu SET rỗng. `[]` thì phân biệt được với "chưa cache".
 */
export const RBAC_ROLE_AUTHORITIES_SUFFIX = 'authorities';

/**
 * Giây. TTL của `rbac:role:{roleName}:authorities`. Hằng trong code, KHÔNG lấy từ `.env`: nó không
 * phải nút chỉnh hiệu năng mà là mức chịu đựng dữ liệu cũ cho đúng 1 tình huống — ai đó sửa thẳng
 * `permission_tbl` trong MySQL, không qua API. Sửa qua API thì `grant`/`revoke` xoá key ngay lập
 * tức nên TTL không có vai trò gì; chỉnh biến này giữa các môi trường chỉ tạo ra khác biệt hành vi
 * không ai kiểm chứng được.
 *
 * Vẫn phải có TTL (không để vô hạn): Redis chạy `maxmemory-policy noeviction` nên key của role
 * không còn ai dùng sẽ nằm lại vĩnh viễn.
 */
export const RBAC_ROLE_CACHE_TTL = 300;

/** SET gồm member `@cached` + các `Authority.code`, TTL = `DURATION`. */
export function userKey(userId: string): string {
  return `${RBAC_USER_KEY_PREFIX}:${userId}`;
}

export function roleAuthoritiesKey(roleName: string): string {
  return `${RBAC_ROLE_KEY_PREFIX}:${roleName}:${RBAC_ROLE_AUTHORITIES_SUFFIX}`;
}
