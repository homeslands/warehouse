import { useNavigation, useRoute, useRouter, type Href } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { useCallback, useEffect, useRef } from 'react'

import { useLeaveOnce } from './useLeaveOnce'

type StackState = { index: number; routes: { key: string }[] }

/**
 * Chuyển giao từ một màn trong Stack TAB (link cũ `/import/create`, `/import/[formSlug]/edit`…, màn xem
 * `new`) sang route modal trên Stack GỐC (`/import-form/…`): bỏ màn này khỏi Stack tab rồi `push` modal.
 * - Màn nằm trên màn khác → `pop(1)` tính từ CHÍNH màn này (action của màn mang `source`).
 * - Màn là đáy Stack tab → thay bằng danh sách `index` (pop ở đáy không được Stack tab xử lý, sẽ nổi
 *   lên Stack gốc).
 * - Gọi từ effect gắn đầu của màn vừa được đẩy lên: state của Stack tab chưa có route của nó → chờ tới
 *   khi có (sự kiện `state`) rồi mới tính vị trí.
 * Không dùng `<Redirect>` / `router.replace`: `replace` từ trong tab sang route gốc thay cả `(tabs)`.
 * Chỉ MỘT lần mỗi route (`useLeaveOnce`).
 */
export function useHandOffToModal(): (href: Href) => void {
  const navigation = useNavigation()
  const route = useRoute()
  const router = useRouter()
  const once = useLeaveOnce()
  const routeKey = route.key
  /** Bỏ nghe `state` khi đang chờ route của màn vào Stack tab. */
  const unsubscribe = useRef<(() => void) | null>(null)
  useEffect(() => () => unsubscribe.current?.(), [])

  return useCallback(
    (href: Href) => {
      if (!once()) return
      /** Chuyển giao nếu route của màn đã có trong Stack tab; `false` = chưa có. */
      const run = () => {
        const state = navigation.getState() as StackState | undefined
        const at = state?.routes.findIndex((r) => r.key === routeKey) ?? -1
        if (at === -1) return false
        navigation.dispatch(at > 0 ? StackActions.pop(1) : StackActions.replace('index'))
        router.push(href)
        return true
      }
      if (run()) return
      unsubscribe.current = navigation.addListener('state', () => {
        if (!run()) return
        unsubscribe.current?.()
        unsubscribe.current = null
      })
    },
    [navigation, router, once, routeKey],
  )
}
