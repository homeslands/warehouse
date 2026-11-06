import type { QueryClient } from '@tanstack/react-query'
import type { AppStore } from '@/app/store'
import {
  selectSessionV1,
  setCacheCleaner,
  useAuthStore,
  type CurrentUser,
  type V1SessionStatus,
} from '@/entities/session'
import type { SessionEndReason } from '@/shared/api/types'
import { purgeClientState } from '@/shared/store'

/**
 * Vòng đời client state theo phiên (screen-contracts R2):
 * - §Quy tắc chung: "Idle lock che dữ liệu… Logout/user change purge query/Redux/draft; chỉ
 *   reauth cùng user mới khôi phục draft còn trong memory."
 * - UI-02: "reauth cùng user mới được phục hồi draft trong memory; đổi user/logout phải purge".
 * - UI-04: "phiên hiện tại bị revoke thì clear cache/login".
 *
 * Nên Redux (draft/workflow) CHỈ bị purge khi:
 * 1. phiên kết thúc vì đăng xuất thật / bị thu hồi / tài khoản bị khoá (`PURGE_REASONS`), hoặc
 * 2. người dùng của phiên mới KHÁC người dùng đang sở hữu client state.
 * Hết hạn/khoá do không hoạt động (`expired`) và `unauthorized` giữ nguyên: nếu sau đó đăng nhập
 * lại bằng user khác thì điều kiện (2) purge.
 *
 * React Query giữ hành vi cũ: `queryClient.clear()` ở mọi start/endSession (server cache tải lại
 * được, không phải draft).
 *
 * Ánh xạ v1 (R2-1 review M01 — legacy phân loại bằng mã số 100002–100005 trong `shared/api/http.ts`,
 * v1 bằng `errorKey` trong `shared/api/v1/session-end.ts`; cả hai cùng ra `SessionEndReason`):
 *
 * | errorKey v1 (PR draft BE, chưa chốt)          | Legacy        | Lý do          | Redux    |
 * |-----------------------------------------------|---------------|----------------|----------|
 * | (logout chủ động)                             | (logout)      | `loggedOut`    | purge    |
 * | SESSION_REVOKED, SESSION_REFRESH_TOKEN_REUSED | 401 100005    | `revoked`      | purge    |
 * | SESSION_USER_INACTIVE                         | 403 100002    | `userInactive` | purge    |
 * | SESSION_EXPIRED                               | 401 100003/4  | `expired`      | giữ      |
 * | 401/403 khoá lạ hoặc body lệch hợp đồng       | 401/403 khác  | `unauthorized` | giữ      |
 * | SESSION_IDLE_EXPIRED                          | —             | `idle`         | giữ (UI-02) |
 * | SESSION_LOCKED, `POST /auth/lock`             | —             | `locked`       | giữ (UI-02) |
 *
 * `idle`/`locked` giữ CHỦ ĐỘNG (không phải mặc định): UI-02 "reauth cùng user mới được phục hồi
 * draft trong memory; đổi user/logout phải purge" — đổi user do điều kiện (2) xử lý.
 */
const PURGE_REASONS: ReadonlySet<SessionEndReason> = new Set([
  'loggedOut',
  'revoked',
  'userInactive',
])

/** Lý do làm purge Redux — export để test khoá bảng trên với `V1_SESSION_END_KEYS`. */
export function isPurgeReason(reason: SessionEndReason): boolean {
  return PURGE_REASONS.has(reason)
}

export type AuthSnapshot = {
  hasSession: boolean
  user: CurrentUser | null
  endReason: SessionEndReason | null
}

/** Danh tính ổn định của user: `userSlug` (PR #80), phiên cũ chưa có thì `userName`. */
export function userIdentity(user: CurrentUser): string {
  return user.userSlug ?? user.userName
}

/**
 * Hàm thuần: từ người sở hữu hiện tại (`owner`) và chuyển trạng thái phiên `prev → next`, quyết
 * định có purge Redux không và ai sở hữu client state sau đó.
 */
export function decideClientStatePurge(
  owner: string | null,
  prev: AuthSnapshot,
  next: AuthSnapshot,
): { owner: string | null; purge: boolean } {
  const sessionEnded = prev.hasSession && !next.hasSession
  if (sessionEnded && next.endReason !== null && PURGE_REASONS.has(next.endReason)) {
    return { owner: null, purge: true }
  }
  if (next.user && next.user !== prev.user) {
    const identity = userIdentity(next.user)
    return { owner: identity, purge: owner !== null && owner !== identity }
  }
  return { owner, purge: false }
}

/**
 * Nối vòng đời phiên với cache: gọi MỘT lần ở `bootstrap.tsx`; test dùng chung hàm này để kiểm
 * đúng wiring thật. Trả hàm gỡ (cho test).
 */
export function wireClientStateLifecycle({
  queryClient,
  store,
}: {
  queryClient: QueryClient
  store: AppStore
}): () => void {
  setCacheCleaner(() => queryClient.clear())

  const initialUser = useAuthStore.getState().user
  let owner: string | null = initialUser ? userIdentity(initialUser) : null
  const unsubscribe = useAuthStore.subscribe((next, prev) => {
    const decision = decideClientStatePurge(owner, prev, next)
    owner = decision.owner
    if (decision.purge) store.dispatch(purgeClientState())
  })

  return () => {
    unsubscribe()
    setCacheCleaner(() => {})
  }
}

/** Ảnh chụp phiên v1 (Redux `sessionV1`) đủ cho quyết định purge. */
export type V1AuthSnapshot = {
  status: V1SessionStatus
  /** `User.id` (UUID) — danh tính ổn định của v1, thay `userSlug ?? userName` của legacy. */
  identityId: string | null
  endReason: SessionEndReason | null
}

export function v1Snapshot(state: Parameters<typeof selectSessionV1>[0]): V1AuthSnapshot {
  const { status, identity, endReason } = selectSessionV1(state)
  return { status, identityId: identity?.id ?? null, endReason }
}

/**
 * Như `decideClientStatePurge` nhưng cho phiên v1, thêm trạng thái `locked`:
 * - về `anonymous` với lý do thuộc `PURGE_REASONS` → purge;
 * - `authenticated` với danh tính khác danh tính trước đó (kể cả mở khoá bằng user khác) → purge nếu
 *   khác chủ hiện tại;
 * - khoá (`idle`/`locked`) và mở khoá cùng user → giữ.
 * `clearQueries`: React Query xoá khi rời hoặc bước vào `authenticated` (như legacy start/endSession).
 */
export function decideV1ClientStatePurge(
  owner: string | null,
  prev: V1AuthSnapshot,
  next: V1AuthSnapshot,
): { owner: string | null; purge: boolean; clearQueries: boolean } {
  const wasAuthenticated = prev.status === 'authenticated'
  const isAuthenticated = next.status === 'authenticated'
  const clearQueries = wasAuthenticated !== isAuthenticated

  const ended = next.status === 'anonymous' && prev.status !== 'anonymous'
  if (ended && next.endReason !== null && PURGE_REASONS.has(next.endReason)) {
    return { owner: null, purge: true, clearQueries }
  }
  if (isAuthenticated && next.identityId !== null && next.identityId !== prev.identityId) {
    return {
      owner: next.identityId,
      purge: owner !== null && owner !== next.identityId,
      clearQueries,
    }
  }
  return { owner, purge: false, clearQueries }
}

/** Nối vòng đời phiên v1 (Redux) với cache. Gọi từ `wireSessionV1`; trả hàm gỡ. */
export function wireClientStateLifecycleV1({
  queryClient,
  store,
}: {
  queryClient: QueryClient
  store: AppStore
}): () => void {
  let prev = v1Snapshot(store.getState())
  let owner: string | null = prev.status === 'authenticated' ? prev.identityId : null
  return store.subscribe(() => {
    const next = v1Snapshot(store.getState())
    if (next.status === prev.status && next.identityId === prev.identityId) {
      prev = next
      return
    }
    const decision = decideV1ClientStatePurge(owner, prev, next)
    prev = next
    owner = decision.owner
    if (decision.clearQueries) queryClient.clear()
    if (decision.purge) store.dispatch(purgeClientState())
  })
}
