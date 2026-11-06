import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { getEnv } from '@/shared/config/env'
import type { SessionEndReason } from '@/shared/api/types'
import {
  getAccessToken,
  readSessionMarker,
  resolveCsrfToken,
  storeSessionCredentials,
  wipeCsrfCookie,
} from './credentials'
import { V1NetworkError, V1ProtocolError, parseV1Envelope, parseV1Error } from './errors'
import { V1_AUTH_PATHS, V1_CSRF_HEADER } from './paths'
import { withCrossTabRefreshLock } from './refresh-mutex'
import { sessionEndReasonForV1, terminalReasonFor } from './session-end'
import type { V1Envelope, V1LoginResult } from './types'

/**
 * Client HTTP cho `/api/v1` (OpenAPI R2). Instance RIÊNG, không đụng `shared/api/http.ts` (legacy):
 * cờ `apiV1Auth` tắt thì không ai gọi module này.
 *
 * - Thành công: kiểm envelope (bắt buộc `traceId`) rồi trả `result`.
 * - Lỗi: `ApiV1Error` (schema `Error`: `errorKey`, `code`, `errors[]`), `V1ProtocolError` (lệch hợp
 *   đồng) hoặc `V1NetworkError` (không có response). Request bị huỷ giữ nguyên lỗi huỷ của axios.
 * - 401: refresh qua cookie `wh_refresh` + header `X-CSRF-Token`, single-flight (một lần/tab, và
 *   tuần tự giữa các tab bằng Web Locks, không có thì mutex localStorage + BroadcastChannel — BE Q3:
 *   không có grace window), gửi lại ĐÚNG MỘT lần. Không có vòng lặp.
 * - Cookie chỉ đi kèm request auth cần nó (L2 review r1): login (nhận Set-Cookie), refresh, logout,
 *   logout-all (server xoá cookie). Request khác không bật credentials.
 */

type TrackedConfig = InternalAxiosRequestConfig & { _sentToken?: string | null; _retried?: boolean }

export type V1SessionHooks = {
  /**
   * Phiên kết thúc (refresh bị từ chối, 401 terminal, hoặc vẫn 401 sau khi refresh). Hợp đồng:
   * handler PHẢI đưa credentials về trạng thái không-hoạt-động đồng bộ (`clearCredentials` hoặc
   * `lockCredentials`) — các 401 đồng thời đến sau sẽ thấy và không gọi lại.
   */
  onSessionEnd: (reason: SessionEndReason) => void
  /** Refresh thành công (rotation) — tầng trên cập nhật danh tính nếu cần. */
  onRefreshed?: (result: V1LoginResult) => void
}

let hooks: V1SessionHooks = { onSessionEnd: () => {} }

/** Tầng `app` tiêm (cùng khuôn `setSessionEndHandler` của legacy): shared không import entities. */
export function setV1SessionHooks(next: V1SessionHooks): void {
  hooks = next
}

export const V1_REFRESH_TIMEOUT_MS = 15_000

const baseURL = getEnv().apiBaseUrl

/** Path auth cần cookie (`Path=/api/v1/auth`): gửi/nhận/xoá `wh_refresh` kể cả khi API khác origin. */
export const V1_COOKIE_PATHS: ReadonlySet<string> = new Set([
  V1_AUTH_PATHS.login,
  V1_AUTH_PATHS.refresh,
  V1_AUTH_PATHS.logout,
  V1_AUTH_PATHS.logoutAll,
])

export const apiV1Http: AxiosInstance = axios.create({ baseURL })

// Không gắn interceptor: refresh không được tự kích hoạt lại luồng 401.
const refreshHttp: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  timeout: V1_REFRESH_TIMEOUT_MS,
})

/** Lỗi axios → lỗi v1 có kiểu. Lỗi huỷ (AbortController) trả nguyên để `isCancelledRequest` nhận. */
export function toV1Error(error: unknown): unknown {
  if (axios.isCancel(error)) return error
  if (error instanceof V1ProtocolError || error instanceof V1NetworkError) return error
  if (!axios.isAxiosError(error)) return error
  if (!error.response) return new V1NetworkError(error.message)
  return parseV1Error(error.response.status, error.response.data)
}

function isLoginResult(value: unknown): value is V1LoginResult {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.accessToken === 'string' &&
    r.accessToken !== '' &&
    typeof r.csrfToken === 'string' &&
    r.csrfToken !== '' &&
    typeof r.sessionId === 'string' &&
    r.sessionId !== '' &&
    typeof r.user === 'object' &&
    r.user !== null
  )
}

/** `result` của login/refresh — thiếu token/CSRF/sessionId là lỗi giao thức, không lưu nửa vời. */
export function assertLoginResult(result: unknown): V1LoginResult {
  if (!isLoginResult(result)) throw new V1ProtocolError('v1 LoginResult: missing required field')
  return result
}

/** Bắt đầu/rotate phiên ở client từ một `LoginResult` hợp lệ (access + CSRF chỉ vào memory). */
export function applyLoginResult(result: V1LoginResult): void {
  storeSessionCredentials(result)
}

/** Phiên đã kết thúc (đăng xuất/khoá) trong lúc refresh đang bay. */
class SessionGoneError extends Error {}

async function doRefresh(): Promise<V1LoginResult> {
  // Đọc CSRF BÊN TRONG lock: tab khác vừa rotate thì cookie CSRF đã là bản mới.
  const before = readSessionMarker()
  const csrf = resolveCsrfToken()
  if (before === null || before.locked || csrf === null) throw new SessionGoneError()
  let result: V1LoginResult
  try {
    const res = await refreshHttp.post<unknown>(V1_AUTH_PATHS.refresh, undefined, {
      headers: { [V1_CSRF_HEADER]: csrf },
    })
    result = assertLoginResult(parseV1Envelope<unknown>(res.data).result)
  } catch (error) {
    throw toV1Error(error)
  }
  const now = readSessionMarker()
  // Đăng xuất / khoá trong lúc chờ: KHÔNG ghi lại (nếu không tab này tự mở khoá) và xoá cookie CSRF
  // server vừa đặt kèm response — khoá phải không mở lại được bằng cách sửa marker rồi reload.
  if (now === null || now.locked) {
    wipeCsrfCookie()
    throw new SessionGoneError()
  }
  applyLoginResult(result)
  hooks.onRefreshed?.(result)
  return result
}

let inflight: Promise<V1LoginResult> | null = null

/** Mọi 401 cùng lúc chờ CHUNG một promise → đúng một `POST /auth/refresh` mỗi tab. */
export function refreshV1Session(): Promise<V1LoginResult> {
  inflight ??= withCrossTabRefreshLock(doRefresh).finally(() => {
    inflight = null
  })
  return inflight
}

export function isSessionGone(error: unknown): boolean {
  return error instanceof SessionGoneError
}

function isActive(): boolean {
  const marker = readSessionMarker()
  return marker !== null && !marker.locked
}

/** Chỉ kết thúc phiên khi còn phiên hoạt động: N request lỗi cùng lúc → handler chạy một lần. */
function endSessionIfActive(reason: SessionEndReason): void {
  if (isActive()) hooks.onSessionEnd(reason)
}

/** 401 ở các path này mang nghĩa nghiệp vụ (sai mật khẩu, refresh hỏng) — không refresh. */
const NO_REFRESH_PATHS: ReadonlySet<string> = new Set([V1_AUTH_PATHS.login, V1_AUTH_PATHS.refresh])

apiV1Http.interceptors.request.use((config) => {
  const tracked = config as TrackedConfig
  const token = getAccessToken()
  if (token) tracked.headers.Authorization = `Bearer ${token}`
  tracked._sentToken = token
  tracked.withCredentials = V1_COOKIE_PATHS.has(tracked.url ?? '')
  return tracked
})

apiV1Http.interceptors.response.use(
  (response) => {
    response.data = parseV1Envelope<unknown>(response.data)
    return response
  },
  async (error: AxiosError) => {
    const typed = toV1Error(error)
    const config = error.config as TrackedConfig | undefined
    if (error.response?.status !== 401 || !config || NO_REFRESH_PATHS.has(config.url ?? '')) {
      throw typed
    }
    // Không còn phiên hoạt động (chưa đăng nhập, đã khoá, request khác vừa kết thúc phiên).
    if (!isActive()) throw typed

    const terminal = terminalReasonFor(typed)
    if (terminal !== null) {
      endSessionIfActive(terminal)
      throw typed
    }

    if (config._retried) {
      endSessionIfActive(sessionEndReasonForV1(typed) ?? 'unauthorized')
      throw typed
    }

    // Request khác đã refresh xong trong lúc request này bay: gửi lại bằng token mới, không refresh nữa.
    if (getAccessToken() !== null && getAccessToken() !== config._sentToken) {
      return apiV1Http({ ...config, _retried: true } as TrackedConfig)
    }

    try {
      await refreshV1Session()
    } catch (refreshError) {
      if (refreshError instanceof SessionGoneError) throw typed
      const reason = sessionEndReasonForV1(refreshError)
      if (reason === null) throw refreshError
      endSessionIfActive(reason)
      throw typed
    }
    return apiV1Http({ ...config, _retried: true } as TrackedConfig)
  },
)

export async function v1Get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await apiV1Http.get<V1Envelope<T>>(url, config)
  return res.data.result
}

export async function v1Post<T>(url: string, body?: unknown, config?: AxiosRequestConfig) {
  const res = await apiV1Http.post<V1Envelope<T>>(url, body, config)
  return res.data.result
}
