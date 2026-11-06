import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit'
import type { SessionEndReason } from '@/shared/api/types'
import {
  applyLoginResult,
  clearCredentials,
  getAccessToken,
  isLockReason,
  isSessionGone,
  lockCredentials,
  readSessionMarker,
  refreshV1Session,
  sessionEndReasonForV1,
  type V1LoginBody,
  type V1LoginResult,
} from '@/shared/api/v1'
import type { RootState } from '@/shared/store'
import {
  lockRequestV1,
  loginRequestV1,
  logoutAllRequestV1,
  logoutRequestV1,
} from '../../api/session-v1.api'
import {
  identityOf,
  injectSessionV1,
  sessionAbsent,
  sessionEnded,
  sessionLocked,
  sessionStarted,
} from './session-v1.slice'

type V1Thunk<R> = ThunkAction<R, RootState, undefined, UnknownAction>

/** Chờ API thu hồi/khoá phiên tối đa bấy nhiêu trước khi kết thúc ở client (như legacy). */
export const V1_SESSION_CALL_TIMEOUT_MS = 5000

async function settleWithin(call: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, V1_SESSION_CALL_TIMEOUT_MS)
  })
  try {
    await Promise.race([call, timeout])
  } catch {
    // Lỗi/chậm không được chặn việc kết thúc phiên ở client.
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Kết thúc phiên ở client theo lý do. `idle`/`locked` → khoá (giữ danh tính + draft, UI-02); còn
 * lại → về đăng nhập. Đây là handler `onSessionEnd` của client v1: đổi credentials ĐỒNG BỘ.
 */
export const endV1Session =
  (reason: SessionEndReason): V1Thunk<void> =>
  (dispatch) => {
    injectSessionV1()
    if (isLockReason(reason)) {
      lockCredentials()
      dispatch(sessionLocked(reason))
    } else {
      clearCredentials()
      dispatch(sessionEnded(reason))
    }
  }

/** UI-01 / UI-02: đăng nhập (kể cả mở khoá — mở khoá là một lần login mới, cùng hoặc khác user). */
export const loginV1 =
  (body: V1LoginBody): V1Thunk<Promise<V1LoginResult>> =>
  async (dispatch) => {
    injectSessionV1()
    const result = await loginRequestV1(body)
    applyLoginResult(result)
    dispatch(sessionStarted({ identity: identityOf(result.user), sessionId: result.sessionId }))
    return result
  }

/**
 * Sau reload: access/CSRF trong memory đã mất → refresh bằng cookie `wh_refresh` + CSRF đọc từ cookie
 * CSRF. Không có marker, marker đang khoá, hoặc không có CSRF (khoá đã xoá cookie) → KHÔNG gọi refresh.
 * Lỗi tạm thời (mạng/5xx/429) giữ marker để F5 lúc có mạng là vào lại.
 */
export const restoreV1Session = (): V1Thunk<Promise<void>> => async (dispatch) => {
  injectSessionV1()
  const marker = readSessionMarker()
  if (marker === null) {
    dispatch(sessionAbsent())
    return
  }
  if (marker.locked) {
    dispatch(sessionLocked('locked'))
    return
  }
  try {
    const result = await refreshV1Session()
    dispatch(sessionStarted({ identity: identityOf(result.user), sessionId: result.sessionId }))
  } catch (error) {
    const reason = isSessionGone(error) ? null : sessionEndReasonForV1(error)
    if (reason === null) dispatch(sessionAbsent())
    else dispatch(endV1Session(reason))
  }
}

/**
 * Khoá chủ động (`POST /auth/lock`).
 * 1. Che dữ liệu NGAY (state `locked`; layout bị gỡ khỏi DOM).
 * 2. Báo server qua interceptor v1: 401 access hết hạn → refresh một lần rồi gửi lại.
 * 3. Dù server khoá được hay không (mạng lỗi, 5xx, quá 5 giây): bỏ access + CSRF khỏi memory và xoá
 *    cookie CSRF — sửa marker rồi reload cũng không refresh được; mở khoá chỉ bằng login (BE Q5).
 */
export const lockV1 = (): V1Thunk<Promise<void>> => async (dispatch) => {
  injectSessionV1()
  dispatch(sessionLocked('locked'))
  try {
    if (getAccessToken() !== null) await settleWithin(lockRequestV1())
  } finally {
    // Phiên đã bị kết thúc trong lúc gửi (vd 401 revoked) → marker đã xoá, không tạo lại.
    if (readSessionMarker() !== null) lockCredentials()
  }
}

/** Đăng xuất: thu hồi trên server nếu còn access token, rồi luôn kết thúc ở client (purge). */
export const logoutV1 = (): V1Thunk<Promise<void>> => async (dispatch) => {
  if (getAccessToken() !== null) await settleWithin(logoutRequestV1())
  dispatch(endV1Session('loggedOut'))
}

/** Đăng xuất mọi thiết bị (operationId `logoutall`); UI xác nhận thuộc UI-04 (M03). */
export const logoutAllV1 = (): V1Thunk<Promise<void>> => async (dispatch) => {
  if (getAccessToken() !== null) await settleWithin(logoutAllRequestV1())
  dispatch(endV1Session('loggedOut'))
}
