import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { getEnv } from '@/shared/config/env'
import type { ApiError, ApiResponse, BackendPaginated, Paginated } from './types'

let getAuthToken: () => string | null = () => null
let onUnauthorized: () => void = () => {}

export function setAuthTokenGetter(fn: () => string | null): void {
  getAuthToken = fn
}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

export const http: AxiosInstance = axios.create({ baseURL: getEnv().apiBaseUrl })

http.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Đăng nhập sai mật khẩu cũng trả 401 (INVALID_CREDENTIALS, mã 100001). Nếu để handler
// toàn cục xử lý, nó sẽ logout + reload cứng trang, và LoginPage không kịp render lỗi.
function isLoginRequest(url: string | undefined): boolean {
  return url === '/auth/login'
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401 && !isLoginRequest(error.config?.url)) onUnauthorized()
    if (error.response?.data) return Promise.reject(error.response.data)
    return Promise.reject(error)
  },
)

export function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'statusCode' in e &&
    'message' in e &&
    typeof (e as ApiError).message === 'string'
  )
}

export async function getData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<ApiResponse<T>>(url, config)
  return res.data.result
}

export async function postData<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<ApiResponse<T>>(url, body)
  return res.data.result
}

export async function patchData<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.patch<ApiResponse<T>>(url, body)
  return res.data.result
}

export async function deleteData<T>(url: string): Promise<T> {
  const res = await http.delete<ApiResponse<T>>(url)
  return res.data.result
}

/**
 * Cô lập hai điểm lệch của backend tại đúng chỗ này:
 *   - request dùng `size`, response trả `pageSize`
 *   - response trả `hasPrevios` (typo)
 * Phần còn lại của codebase không bao giờ thấy chúng.
 */
export async function getPaginated<T>(
  url: string,
  params: { page: number; size: number },
): Promise<Paginated<T>> {
  const raw = await getData<BackendPaginated<T>>(url, { params })

  return {
    items: raw.items,
    total: raw.total,
    page: raw.page,
    pageSize: raw.pageSize,
    totalPages: raw.totalPages,
    hasNext: raw.hasNext,
    hasPrevious: raw.hasPrevios,
  }
}
