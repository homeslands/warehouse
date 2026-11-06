import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { SessionEndReason } from '@/shared/api/types'
import type { V1User } from '@/shared/api/v1'
import { preserveOnPurge, rootReducer, type RootState } from '@/shared/store'

/**
 * Trạng thái phiên v1 (#242 M02) — workflow/session UI ở Redux (D08, screen-contracts §Quy tắc
 * chung). Hồ sơ đầy đủ (`GET /auth/me`) thuộc React Query, KHÔNG chép vào đây — slice chỉ giữ danh
 * tính tối thiểu để: hiện màn khoá UI-02, quyết định purge khi đổi user, và điền sẵn ô đăng nhập.
 *
 * - `unknown`: đang khôi phục sau reload (refresh bằng cookie).
 * - `anonymous`: không có phiên (`endReason` = vì sao, `null` = chưa từng đăng nhập).
 * - `authenticated`: có access token trong memory.
 * - `locked`: idle/lock (UI-02) — access token đã bỏ, draft Redux còn nguyên cho cùng user.
 */
export type V1SessionStatus = 'unknown' | 'anonymous' | 'authenticated' | 'locked'

export type V1Identity = Pick<V1User, 'id' | 'phoneNumber' | 'displayName'>

export type V1SessionState = {
  status: V1SessionStatus
  identity: V1Identity | null
  sessionId: string | null
  endReason: SessionEndReason | null
}

export const initialV1SessionState: V1SessionState = {
  status: 'unknown',
  identity: null,
  sessionId: null,
  endReason: null,
}

export function identityOf(user: V1User): V1Identity {
  return { id: user.id, phoneNumber: user.phoneNumber, displayName: user.displayName }
}

type Started = { identity: V1Identity; sessionId: string }

export const sessionV1Slice = createSlice({
  name: 'sessionV1',
  initialState: initialV1SessionState,
  reducers: {
    sessionStarted: (_state, { payload }: PayloadAction<Started>) => ({
      status: 'authenticated',
      identity: payload.identity,
      sessionId: payload.sessionId,
      endReason: null,
    }),
    /** Refresh (rotation) thành công: giữ trạng thái, cập nhật danh tính/sessionId theo server. */
    sessionRefreshed: (state, { payload }: PayloadAction<Started>) => {
      state.identity = payload.identity
      state.sessionId = payload.sessionId
    },
    /** Khoá: giữ `identity` để UI-02 biết user cũ và để purge khi người khác đăng nhập. */
    sessionLocked: (state, { payload }: PayloadAction<'idle' | 'locked'>) => {
      state.status = 'locked'
      state.endReason = payload
    },
    sessionEnded: (_state, { payload }: PayloadAction<SessionEndReason>) => ({
      status: 'anonymous',
      identity: null,
      sessionId: null,
      endReason: payload,
    }),
    /** Khôi phục sau reload thất bại vì lý do tạm thời / không có phiên — không đặt lý do. */
    sessionAbsent: (state) => {
      state.status = 'anonymous'
      state.identity = null
      state.sessionId = null
    },
  },
})

export const { sessionStarted, sessionRefreshed, sessionLocked, sessionEnded, sessionAbsent } =
  sessionV1Slice.actions

declare module '@/shared/store' {
  // Module augmentation (xem `shared/store/root-reducer.ts`). Khai field trực tiếp — tương đương
  // `WithSlice<typeof sessionV1Slice>` — để không cần interface rỗng.
  interface LazyLoadedSlices {
    sessionV1: V1SessionState
  }
}

/**
 * Inject LƯỜI (không ở lúc nạp module): cờ `apiV1Auth` tắt thì store không có slice này, hành vi
 * như M01. Gọi lại nhiều lần vô hại (RTK bỏ qua reducer trùng).
 */
export function injectSessionV1(): void {
  rootReducer.inject(sessionV1Slice)
  preserveOnPurge(sessionV1Slice.reducerPath)
}

export function selectSessionV1(state: RootState): V1SessionState {
  return state.sessionV1 ?? initialV1SessionState
}
