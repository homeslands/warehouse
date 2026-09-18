import { HttpResponse } from 'msw'
import type { ApiError, ApiResponse, BackendPaginated } from '@/shared/api/types'

/**
 * Dựng response giả ĐÚNG hình dạng backend trả (envelope, `hasPrevios`), để test không tự chép
 * lại JSON. Truyền dữ liệu có kiểu của entity (`ok<Example>(...)`) để TypeScript bắt lệch field.
 */
export function ok<T>(result: T) {
  const body: ApiResponse<T> = { message: 'ok', statusCode: 200, timestamp: '', result }
  return HttpResponse.json(body)
}

export function paginated<T>(
  items: T[],
  {
    page = 1,
    size = 10,
    total = items.length,
  }: { page?: number; size?: number; total?: number } = {},
) {
  const totalPages = Math.ceil(total / size)
  const result: BackendPaginated<T> = {
    items,
    total,
    page,
    pageSize: size,
    totalPages,
    hasNext: page < totalPages,
    hasPrevios: page > 1,
  }
  return ok(result)
}

export function apiError(status: number, code?: number, message = 'Error') {
  const body: ApiError = {
    statusCode: status,
    ...(code === undefined ? {} : { code }),
    timestamp: '',
    path: '',
    method: '',
    message,
  }
  return HttpResponse.json(body, { status })
}
