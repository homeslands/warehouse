export type ApiResponse<T> = {
  message: string
  statusCode: number
  timestamp: string
  result: T
}

export type ApiError = {
  statusCode: number
  code?: number
  timestamp: string
  path: string
  method: string
  message: string
}

/** Đúng như backend trả về — chú ý typo `hasPrevios`. Chỉ dùng nội bộ trong http.ts. */
export type BackendPaginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrevios: boolean
}

/** Entity dùng optimistic locking: gửi lại `version` nhận từ lần GET gần nhất khi cập nhật. */
export type Versioned = { version: number }

/** Hình dạng mà phần còn lại của app nhìn thấy. */
export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

/**
 * Tham số một trang danh sách: `page`, `size` và bộ lọc riêng của màn (`F`). Đây là thứ đi vào
 * query key và `getPaginated` — đổi bộ lọc là một mục cache khác.
 */
export type ListParams<F extends object = Record<never, never>> = { page: number; size: number } & F

/** Vì sao phiên kết thúc — interceptor và vòng đời phiên dùng chung, màn login hiện câu tương ứng. */
export type SessionEndReason = 'expired' | 'revoked' | 'userInactive' | 'unauthorized' | 'loggedOut'

/** `result` của POST /auth/login và /auth/refresh. */
export type AuthTokens = {
  accessToken: string
  refreshToken: string
  expireTime: string
  expireTimeRefreshToken: string
}
