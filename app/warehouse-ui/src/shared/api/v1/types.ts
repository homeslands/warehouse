/**
 * Kiểu của API v1 — chép từ `docs/project/baseline/contracts/openapi-v1.json` (WH-DEC-20261105-R2).
 * Chỉ các schema M02 dùng (auth/session). Đổi ở đây phải đối chiếu lại OpenAPI, không tự thêm field.
 *
 * API v1 CHƯA chạy trên main (BE #197 còn draft) — mọi thứ dưới đây là hợp đồng, chưa phải hành vi
 * đã kiểm bằng API thật.
 */

/** Envelope thành công: `message`, `statusCode` 2xx, `timestamp`, `traceId`, `result` đều bắt buộc. */
export type V1Envelope<T> = {
  message: string
  statusCode: number
  timestamp: string
  traceId: string
  result: T
}

/** `components.schemas.FieldError` — mọi field bắt buộc. */
export type V1FieldError = {
  field: string
  errorKey: string
  message: string
}

/** `components.schemas.Error` — `errors` là field duy nhất không bắt buộc. */
export type V1ErrorBody = {
  statusCode: number
  code: number
  errorKey: string
  message: string
  traceId: string
  timestamp: string
  errors?: V1FieldError[]
}

/** `components.schemas.Role`. */
export type V1Role = {
  id: string
  name: string
  family: 'ADMIN' | 'MANAGER' | 'SUPERVISOR'
  level: number
  builtIn: boolean
  authorityCodes: string[]
  version: number
  description?: string
}

/** `components.schemas.User` (bỏ `highlights` — chỉ có ở kết quả tìm kiếm). */
export type V1User = {
  id: string
  phoneNumber: string
  displayName: string
  email: string
  isActive: boolean
  role: V1Role
  warehouseIds: string[]
  version: number
  dob?: string | null
  address?: string
  avatarFileId?: string | null
}

/** `components.schemas.Login` — body của `POST /auth/login`. */
export type V1LoginBody = {
  phoneNumber: string
  password: string
}

/**
 * `components.schemas.LoginResult` — `result` của `POST /auth/login` và `POST /auth/refresh`.
 * Refresh token KHÔNG có trong JSON: nó ở cookie HttpOnly `wh_refresh` (Set-Cookie), JS không đọc.
 */
export type V1LoginResult = {
  accessToken: string
  /** `const: 900` — access 15 phút (business-rules §Auth/RBAC). */
  expiresIn: number
  user: V1User
  sessionId: string
  csrfToken: string
}

/** `components.schemas.ActionResult` — `result` của logout / logout-all / lock / activity. */
export type V1ActionResult = {
  id: string
  version: number
  status: string
  traceId: string
}
