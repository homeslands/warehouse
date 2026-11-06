/**
 * Đường dẫn auth v1 — tương đối với `VITE_API_BASE_URL` (đã gồm `/api/v1`), theo `paths` của
 * `openapi-v1.json`. Legacy dùng CÙNG tiền tố `/api/v1` và trùng vài path (`/auth/login`…) nhưng khác
 * hình dạng body — vì vậy client v1 là instance riêng, chỉ dùng khi cờ `apiV1Auth` bật.
 */
export const V1_AUTH_PATHS = {
  /** operationId `login` — PUBLIC_AUTH. */
  login: '/auth/login',
  /** operationId `refresh` — PUBLIC_AUTH, security `RefreshCookie` + header `X-CSRF-Token`. */
  refresh: '/auth/refresh',
  /** operationId `logout` — AUTHENTICATED. */
  logout: '/auth/logout',
  /** operationId `logoutall` — AUTHENTICATED. */
  logoutAll: '/auth/logout-all',
  /** operationId `lock` — AUTHENTICATED. */
  lock: '/auth/lock',
  /** operationId `recordInteractiveActivity` — AUTHENTICATED, rate limit phía server. */
  activity: '/auth/activity',
  /** operationId `getProfile` — AUTHENTICATED. */
  me: '/auth/me',
} as const

/**
 * Tên header CSRF — `paths./auth/refresh.post.parameters[name="X-CSRF-Token"]` (required, minLength 16).
 * Header `Origin` cũng required nhưng là forbidden header: trình duyệt tự gửi, JS không đặt được.
 */
export const V1_CSRF_HEADER = 'X-CSRF-Token'
