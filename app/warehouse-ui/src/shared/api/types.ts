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
