import type { QueryClient } from '@tanstack/react-query'
import type { AppStore } from '@/app/store'
import {
  endV1Session,
  identityOf,
  injectSessionV1,
  restoreV1Session,
  selectSessionV1,
  sessionRefreshed,
} from '@/entities/session'
import { setV1SessionHooks, subscribeCrossTab, type V1PersistedSession } from '@/shared/api/v1'
import { wireClientStateLifecycleV1 } from './client-state-lifecycle'

/**
 * Đồng bộ với tab khác (D14 §2 "UI đồng bộ khoá/logout nhiều tab"). Chỉ phản ứng với thay đổi do
 * TAB KHÁC ghi (`storage` không bắn ở tab ghi).
 */
export function syncV1SessionFromOtherTab(store: AppStore, persisted: V1PersistedSession | null) {
  const { status, sessionId } = selectSessionV1(store.getState())
  if (persisted === null) {
    // Tab khác đăng xuất / phiên chết: không biết lý do thật → coi như đăng xuất (purge), như legacy.
    if (status === 'authenticated' || status === 'locked') {
      store.dispatch(endV1Session('loggedOut'))
    }
    return
  }
  if (persisted.locked) {
    if (status === 'authenticated') store.dispatch(endV1Session('locked'))
    return
  }
  // Tab khác đăng nhập / mở khoá / đổi phiên: lấy access token của phiên đang lưu bằng refresh.
  if (status !== 'authenticated' || persisted.sessionId !== sessionId) {
    void store.dispatch(restoreV1Session())
  }
}

/**
 * Bật phiên v1. CHỈ gọi khi `BACKEND_SUPPORTS.apiV1Auth` (bootstrap). Trả hàm gỡ (cho test).
 */
export function wireSessionV1({
  queryClient,
  store,
}: {
  queryClient: QueryClient
  store: AppStore
}): () => void {
  injectSessionV1()
  setV1SessionHooks({
    onSessionEnd: (reason) => store.dispatch(endV1Session(reason)),
    onRefreshed: (result) =>
      store.dispatch(
        sessionRefreshed({ identity: identityOf(result.user), sessionId: result.sessionId }),
      ),
  })
  const stopLifecycle = wireClientStateLifecycleV1({ queryClient, store })
  const stopCrossTab = subscribeCrossTab((persisted) => syncV1SessionFromOtherTab(store, persisted))
  void store.dispatch(restoreV1Session())

  return () => {
    stopCrossTab()
    stopLifecycle()
    setV1SessionHooks({ onSessionEnd: () => {} })
  }
}
