import type { QueryClient } from '@tanstack/react-query'
import type { AppStore } from '@/app/store'
import { setCacheCleaner, useAuthStore, type CurrentUser } from '@/entities/session'
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
 */
const PURGE_REASONS: ReadonlySet<SessionEndReason> = new Set([
  'loggedOut',
  'revoked',
  'userInactive',
])

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
