import { queryClient } from '@/app/query-client'
import { store } from '@/app/store'
import { purgeClientState } from '@/shared/store'

/**
 * Hàm dọn cache tiêm vào `entities/session` (`setCacheCleaner`): xoá server cache React Query VÀ
 * client state Redux (screen-contracts R2: logout/đổi user purge query/Redux/draft).
 */
export function clearClientState(): void {
  queryClient.clear()
  store.dispatch(purgeClientState())
}
