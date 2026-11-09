import { useEffect, useRef, useState } from 'react'

import type { DoneState } from '../ui/SheetHeaderButton'
import { haptics } from './haptics'
import { useGuardedAction } from './useGuardedAction'

/** Sau khi ghi xong, giữ dấu tích "xong" một nhịp cho người dùng thấy rồi mới đóng sheet. */
export const SHEET_CLOSE_DELAY_MS = 350

export type SheetSubmitOptions = {
  /** Thao tác ghi khi bấm ✓. Ném lỗi = thất bại. */
  onSubmit: () => Promise<void>
  /** Đóng sheet (thường `router.back()`). Gọi sau `closeDelayMs` khi thành công. */
  onClose: () => void
  /** BẮT BUỘC: báo lỗi cho người dùng (Alert, lỗi tại ô…) — lỗi không bao giờ bị nuốt. */
  onError: (error: unknown) => void
  closeDelayMs?: number
}

/**
 * Vũ đạo chung của nút ✓ trong mọi sheet, dựa trên `useGuardedAction` (khoá chống bấm đôi):
 * - đang chạy → `doneState = 'busy'` (vòng quay, ✕/✓ khoá);
 * - thành công → rung success, `doneState = 'success'` (✓ khoá tới lúc đóng), đóng sau `closeDelayMs`;
 * - thất bại → rung error, mở khoá, gọi `onError` (nút ✓ native không animate được nên không lắc).
 * Sheet bị đóng (unmount) giữa chừng → không rung, không hẹn giờ đóng (sẽ `back()` nhầm màn).
 */
export function useSheetSubmit({
  onSubmit,
  onClose,
  onError,
  closeDelayMs = SHEET_CLOSE_DELAY_MS,
}: SheetSubmitOptions) {
  const [succeeded, setSucceeded] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const action = useGuardedAction(onSubmit, {
    onError: (e) => {
      if (mounted.current) haptics.error()
      onError(e)
    },
  })

  const submit = async () => {
    if (!(await action.run()) || !mounted.current) return
    setSucceeded(true)
    haptics.success()
    closeTimer.current = setTimeout(onClose, closeDelayMs)
  }

  const doneState: DoneState = succeeded ? 'success' : action.pending ? 'busy' : 'idle'
  return { doneState, submit }
}
