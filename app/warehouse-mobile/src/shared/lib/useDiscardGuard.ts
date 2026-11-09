import { usePreventRemove } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { registerLeaveGuard } from './forced-leave'
import { confirmAction } from './native-confirm'

export type DiscardGuardOptions = {
  /** Đã sửa mà chưa ✓. Ghi xong thì màn đặt lại `false` TRƯỚC khi đóng (không hỏi). */
  dirty: boolean
  /** `false` → không chặn (vd đang ghi phiếu, sheet chỉ đọc). Mặc định `true`. */
  enabled?: boolean
}

/**
 * Sheet sửa có thay đổi chưa ✓ mà người dùng rời đi → hỏi "Bỏ thay đổi?" bằng hộp GỐC `confirmAction`
 * ([Bỏ thay đổi] đỏ, [Tiếp tục sửa]). Chặn MỌI lối rời màn qua `usePreventRemove` của expo-router:
 * - vuốt xuống sheet iOS: route bị chặn (kể cả khi nó nằm trong Stack lồng của sheet — chặn lan lên route
 *   sheet của Stack GỐC) → RN Screens nhận `preventNativeDismiss`, giữ sheet và báo
 *   `nativeDismissCancelled` → native-stack thử `pop` → bị chặn → hỏi;
 * - back phần cứng Android / `router.back()`: action bị chặn → hỏi.
 * Đồng ý → cho đi tiếp đúng action bị chặn; không → ở lại. ✕ của sheet gọi `confirmLeave()` rồi mới
 * đóng (`if (await confirmLeave()) close()`): chưa sửa → `true` ngay, không hỏi; đồng ý bỏ → tắt chặn
 * nên lần đóng ngay sau đó không hỏi lại. Đang có hộp hỏi mở → lần rời mới bị bỏ qua (`confirmLeave` → `false`).
 *
 * Rời BẮT BUỘC (đích đổi khi đổi phiên — `releaseLeaveGuards()` của `forced-leave.ts`, gọi bởi
 * `useLeaveSheetOnSessionChange`) không bao giờ bị chặn: guard tắt ngay, không hỏi. Màn đã bị gỡ (vd
 * guard `Stack.Protected` của sheet lật) hoặc đã bị nhả trong lúc hộp hỏi đang mở → câu trả lời bị bỏ qua:
 * không chạy lại action cũ trên state mới, `confirmLeave` → `false`.
 */
export function useDiscardGuard({ dirty, enabled = true }: DiscardGuardOptions): {
  confirmLeave: () => Promise<boolean>
} {
  const { t } = useTranslation('common')
  // Đã đồng ý bỏ: màn đang rời đi, không chặn nữa (đặt cùng lượt với `disablePrevention` / `repeat`
  // để `preventRemove` về `false` ngay lần vẽ sau).
  const [discarded, setDiscarded] = useState(false)
  // Một hộp hỏi một lúc: lần rời thứ hai (vuốt / back / ✕) trong lúc hộp đang mở bị bỏ qua — chỉ
  // lần đầu được đi tiếp, không bao giờ rời hai lần (pop thêm màn bên dưới sheet).
  const asking = useRef(false)
  // `false` khi màn đã tháo ra hoặc bị nhả bởi lần rời bắt buộc: câu trả lời đến sau thì bỏ qua.
  const active = useRef(true)
  // Hết sửa (✓ ghi xong / người dùng hoàn tác) → lần sửa sau lại được chặn.
  if (discarded && !dirty) setDiscarded(false)
  const guarding = dirty && enabled && !discarded

  const ask = (): Promise<boolean> | null => {
    if (asking.current) return null
    asking.current = true
    return confirmAction({
      title: t('compose.discard.title'),
      message: t('compose.discard.message'),
      confirmLabel: t('compose.discard.confirm'),
      cancelLabel: t('compose.discard.keep'),
      destructive: true,
    }).finally(() => {
      asking.current = false
    })
  }

  const disablePrevention = usePreventRemove(guarding, ({ repeat }) => {
    ask()
      ?.then((ok) => {
        if (!ok || !active.current) return
        setDiscarded(true)
        repeat()
      })
      // Hộp hỏi lỗi → coi như "Tiếp tục sửa" (ở lại).
      .catch(() => {})
  })

  // `disablePrevention` ổn định (useLatestCallback của expo-router) → đăng ký một lần mỗi lần gắn.
  useEffect(() => {
    active.current = true
    const unregister = registerLeaveGuard(() => {
      active.current = false
      setDiscarded(true)
      disablePrevention()
    })
    return () => {
      active.current = false
      unregister()
    }
  }, [disablePrevention])

  const confirmLeave = async (): Promise<boolean> => {
    if (!guarding) return true
    const answer = ask()
    if (!answer) return false
    const ok = await answer.catch(() => false)
    if (!active.current) return false
    if (ok) {
      setDiscarded(true)
      disablePrevention()
    }
    return ok
  }

  return { confirmLeave }
}
