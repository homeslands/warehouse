// Key thu hồi token trên Redis (`REDIS_AUTH_DB`, dùng chung DB với cache RBAC — prefix riêng nên
// không đụng nhau). Khác cache RBAC ở chỗ **mất key là mất hiệu lực thu hồi**: token của user đã
// logout sống lại. Vì vậy đổi các prefix dưới đây là breaking change — mọi key đã ghi trước đó
// thành mồ côi. Xem `docs/specs/token-revocation.md`.

/** Prefix key thu hồi 1 phiên: `BLACK_LIST_{uid}_{sid}`. Access và refresh token mang cùng `sid`
 * nên 1 key giết cả cặp. */
export const BLACKLIST_PREFIX = 'BLACK_LIST';

/** Prefix key cutoff theo user: `TOKEN_IAT_AVAILABLE_{uid}`, value là mốc epoch giây — mọi token
 * có `iat` nhỏ hơn đều chết (logout-all; sau này đổi mật khẩu / xoá tài khoản dùng cùng key). */
export const IAT_AVAILABLE_PREFIX = 'TOKEN_IAT_AVAILABLE';

/** Value của key blacklist. Chỉ cần *tồn tại* là đủ để từ chối, nội dung không được đọc tới. */
export const REVOKED_FLAG_VALUE = '1';
