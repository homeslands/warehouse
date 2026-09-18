import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { getEnv } from '@/shared/config/env'
import { DATA_VERSION_CONFLICT_CODE } from './error-codes'
import { LOGIN_PATH, REFRESH_PATH } from './routes'
import { getTokens, setTokens } from './token-storage'
import type {
  ApiError,
  ApiResponse,
  AuthTokens,
  BackendPaginated,
  ListParams,
  Paginated,
  SessionEndReason,
} from './types'

/** Config có thêm dấu vết cho luồng 401: token đã gửi và đã gửi lại hay chưa. */
type TrackedConfig = InternalAxiosRequestConfig & { _sentToken?: string; _retried?: boolean }

let onSessionEnd: (reason: SessionEndReason) => void = () => {}

/**
 * Tầng `app` tiêm cách kết thúc phiên (xoá token, xoá cache, đổi trạng thái). `shared` không được
 * import `entities`, nên interceptor chỉ báo "phiên kết thúc vì lý do X".
 *
 * Hợp đồng: handler PHẢI xoá token đồng bộ (`clearTokens()`). Interceptor chỉ gọi handler khi
 * còn token, nên các request lỗi đồng thời đến sau sẽ bỏ qua — handler chạy đúng một lần mỗi phiên.
 */
export function setSessionEndHandler(fn: (reason: SessionEndReason) => void): void {
  onSessionEnd = fn
}

export const http: AxiosInstance = axios.create({ baseURL: getEnv().apiBaseUrl })

/**
 * Refresh treo thì `refreshing` treo theo, và MỌI 401 sau đó chờ nó mãi. Hết giờ = lỗi không có
 * response → coi là lỗi tạm thời, không kết thúc phiên.
 */
export const REFRESH_TIMEOUT_MS = 15_000

// Axios riêng, KHÔNG gắn interceptor: refresh đi qua đây để không tự kích hoạt lại luồng 401.
const refreshClient: AxiosInstance = axios.create({
  baseURL: getEnv().apiBaseUrl,
  timeout: REFRESH_TIMEOUT_MS,
})

http.interceptors.request.use((config) => {
  const tracked = config as TrackedConfig
  const token = getTokens()?.accessToken
  if (token) tracked.headers.Authorization = `Bearer ${token}`
  tracked._sentToken = token
  return tracked
})

// 401 ở các đường dẫn này mang nghĩa nghiệp vụ (sai mật khẩu, refresh hỏng) — không được kích hoạt
// refresh. Sai mật khẩu mà để handler xử lý thì LoginPage không kịp hiện lỗi.
// /auth/logout KHÔNG nằm đây: backend đòi access token còn hạn, nên logout sau khi token hết hạn
// phải refresh rồi gửi lại, nếu không phiên (`sid`) trên server không bị thu hồi.
const NO_REFRESH_PATHS = new Set([LOGIN_PATH, REFRESH_PATH])

let refreshing: Promise<void> | null = null

/** Phiên đã kết thúc trong lúc refresh đang bay (đăng xuất, tab khác đăng xuất). */
class SessionGoneError extends Error {}

/** Mọi 401 đến trong lúc đang refresh chờ CHUNG một promise → đúng một lần gọi /auth/refresh. */
function refreshOnce(refreshToken: string): Promise<void> {
  refreshing ??= refreshClient
    .post<ApiResponse<AuthTokens>>(REFRESH_PATH, { refreshToken })
    .then(({ data }) => {
      const current = getTokens()
      // Đã đăng xuất trong lúc chờ: KHÔNG ghi lại token, nếu không tab này tự đăng nhập lại.
      if (current === null) throw new SessionGoneError()
      // Storage đã giữ cặp khác (tab khác đăng nhập/đổi token): không ghi đè, gửi lại bằng cặp đang lưu.
      if (current.refreshToken !== refreshToken) return
      setTokens({ accessToken: data.result.accessToken, refreshToken: data.result.refreshToken })
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

/** `null` = lỗi tạm thời (mạng, hết giờ, 5xx, 408, 429): KHÔNG kết thúc phiên. */
function sessionEndReasonFor(error: unknown): SessionEndReason | null {
  if (!axios.isAxiosError(error) || !error.response) return null
  const { status } = error.response
  // 429: backend giới hạn /auth/refresh theo IP — refresh token vẫn hợp lệ.
  if (status >= 500 || status === 408 || status === 429) return null
  const code = (error.response.data as Partial<ApiError> | undefined)?.code
  if (status === 401 && (code === 100003 || code === 100004)) return 'expired'
  if (status === 401 && code === 100005) return 'revoked'
  if (status === 403 && code === 100002) return 'userInactive'
  return 'unauthorized'
}

/** Chỉ kết thúc phiên nếu còn phiên: N request lỗi cùng lúc không gọi handler N lần hay ghi đè lý do. */
function endSessionIfActive(reason: SessionEndReason): void {
  if (getTokens() !== null) onSessionEnd(reason)
}

function toRejection(error: AxiosError<ApiError>): unknown {
  return error.response?.data ?? error
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const config = error.config as TrackedConfig | undefined
    if (error.response?.status !== 401 || !config || NO_REFRESH_PATHS.has(config.url ?? '')) {
      throw toRejection(error)
    }

    if (config._retried) {
      endSessionIfActive('unauthorized')
      throw toRejection(error)
    }

    const tokens = getTokens()
    // Không còn token = không còn phiên để kết thúc (đã đăng xuất, hoặc request khác vừa kết thúc
    // phiên) → chỉ reject, không gọi handler.
    if (!tokens) throw toRejection(error)

    if (tokens.accessToken !== config._sentToken) {
      return http({ ...config, _retried: true } as TrackedConfig)
    }

    try {
      await refreshOnce(tokens.refreshToken)
    } catch (refreshError) {
      if (refreshError instanceof SessionGoneError) throw toRejection(error)
      const reason = sessionEndReasonFor(refreshError)
      if (reason === null) throw axios.isAxiosError(refreshError) ? refreshError : error
      const current = getTokens()
      if (current === null) throw toRejection(error)
      // Lỗi này thuộc về refresh token ĐÃ GỬI. Storage đã giữ cặp khác (đổi mật khẩu, tab khác đăng
      // nhập lại) thì phiên mới không liên quan: gửi lại bằng cặp đang lưu, như nhánh thành công
      // của refreshOnce.
      if (current.refreshToken !== tokens.refreshToken) {
        return http({ ...config, _retried: true } as TrackedConfig)
      }
      onSessionEnd(reason)
      throw toRejection(error)
    }

    return http({ ...config, _retried: true } as TrackedConfig)
  },
)

/** Request bị huỷ (rời trang khi đang tải, AbortController) — không phải lỗi cần báo người dùng. */
export function isCancelledRequest(e: unknown): boolean {
  return axios.isCancel(e) || (e instanceof DOMException && e.name === 'AbortError')
}

export function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'statusCode' in e &&
    'message' in e &&
    typeof (e as ApiError).message === 'string'
  )
}

export function isVersionConflict(e: unknown): boolean {
  return isApiError(e) && e.statusCode === 409 && e.code === DATA_VERSION_CONFLICT_CODE
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
 *
 * Bộ lọc rỗng (`undefined` / `null` / `''`) bị bỏ trước khi gửi: backend lọc `name=''` thành "chứa
 * chuỗi rỗng" hay bỏ qua tuỳ endpoint — không gửi thì chắc chắn là "không lọc".
 */
export async function getPaginated<T>(
  url: string,
  params: ListParams<Record<string, unknown>>,
): Promise<Paginated<T>> {
  const query = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  )
  const raw = await getData<BackendPaginated<T>>(url, { params: query })

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
