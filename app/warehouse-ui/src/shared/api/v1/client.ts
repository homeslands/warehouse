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
  readPersistedSession,
  setAccessToken,
  writePersistedSession,
} from './credentials'
import { V1NetworkError, V1ProtocolError, parseV1Envelope, parseV1Error } from './errors'
import { V1_AUTH_PATHS, V1_CSRF_HEADER } from './paths'
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
 *   tuần tự giữa các tab bằng Web Locks nếu trình duyệt có), gửi lại ĐÚNG MỘT lần. Không có vòng lặp.
 */

type TrackedConfig = InternalAxiosRequestConfig & { _sentToken?: string | null; _retried?: boolean }

export type V1SessionHooks = {
  /**
   * Phiên kết thúc (refresh bị từ chối, 401 terminal, hoặc vẫn 401 sau khi refresh). Hợp đồng:
   * handler PHẢI đưa credentials về trạng thái không-hoạt-động đồng bộ (`clearCredentials` hoặc
   * `markCredentialsLocked`) — các 401 đồng thời đến sau sẽ thấy và không gọi lại.
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

/** Tên Web Lock dùng chung giữa các tab — hai tab refresh cùng cookie sẽ bị coi là reuse (TC-AUTH-05). */
export const V1_REFRESH_LOCK = 'warehouse.auth.v1.refresh'

const baseURL = getEnv().apiBaseUrl

/** `withCredentials`: cookie `wh_refresh` đi kèm cả khi API khác origin (credentials: include). */
export const apiV1Http: AxiosInstance = axios.create({ baseURL, withCredentials: true })

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

/** Bắt đầu/rotate phiên ở client từ một `LoginResult` hợp lệ. */
export function applyLoginResult(result: V1LoginResult): void {
  setAccessToken(result.accessToken)
  writePersistedSession({ csrfToken: result.csrfToken, sessionId: result.sessionId, locked: false })
}

/** Phiên đã kết thúc (đăng xuất/khoá) trong lúc refresh đang bay. */
class SessionGoneError extends Error {}

async function withCrossTabLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return task()
  // Lock giữ tới khi `task` xong; tab khác chờ rồi đọc CSRF/cookie đã rotate.
  return await locks.request(V1_REFRESH_LOCK, task)
}

async function doRefresh(): Promise<V1LoginResult> {
  // Đọc CSRF BÊN TRONG lock: tab khác vừa rotate thì đây là bản mới, cookie trình duyệt cũng mới.
  const before = readPersistedSession()
  if (before === null || before.locked) throw new SessionGoneError()
  let result: V1LoginResult
  try {
    const res = await refreshHttp.post<unknown>(V1_AUTH_PATHS.refresh, undefined, {
      headers: { [V1_CSRF_HEADER]: before.csrfToken },
    })
    result = assertLoginResult(parseV1Envelope<unknown>(res.data).result)
  } catch (error) {
    throw toV1Error(error)
  }
  const now = readPersistedSession()
  // Đăng xuất / khoá trong lúc chờ: KHÔNG ghi lại, nếu không tab này tự đăng nhập lại.
  if (now === null || now.locked) throw new SessionGoneError()
  applyLoginResult(result)
  hooks.onRefreshed?.(result)
  return result
}

let inflight: Promise<V1LoginResult> | null = null

/** Mọi 401 cùng lúc chờ CHUNG một promise → đúng một `POST /auth/refresh` mỗi tab. */
export function refreshV1Session(): Promise<V1LoginResult> {
  inflight ??= withCrossTabLock(doRefresh).finally(() => {
    inflight = null
  })
  return inflight
}

export function isSessionGone(error: unknown): boolean {
  return error instanceof SessionGoneError
}

function isActive(): boolean {
  const persisted = readPersistedSession()
  return persisted !== null && !persisted.locked
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
