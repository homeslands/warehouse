import { useRef, useState } from 'react'

export type GuardedAction<A extends unknown[]> = {
  /**
   * Chạy thao tác. Đang chạy (hoặc đã thành công mà chưa `reset`) → bỏ qua. Không bao giờ reject;
   * trả `true` chỉ khi lần này chạy và thành công.
   */
  run: (...args: A) => Promise<boolean>
  pending: boolean
  /** Lỗi của lần chạy gần nhất (đã được báo qua `onError`). */
  error: unknown
  /** Mở khoá sau một lần thành công khi màn vẫn còn (vd đóng rồi mở lại sheet). */
  reset: () => void
}

/**
 * Chạy một thao tác ghi lên server an toàn:
 * - khoá ĐỒNG BỘ (ref) nên bấm đôi / phím "Đi" gọi lần hai đều bị bỏ qua;
 * - thành công → giữ khoá (thường màn sẽ đóng / điều hướng đi ngay); cần chạy tiếp thì `reset()`;
 * - thất bại → mở khoá, lưu `error` và gọi `onError` BẮT BUỘC — lỗi không bao giờ bị nuốt.
 */
export function useGuardedAction<A extends unknown[]>(
  action: (...args: A) => Promise<void>,
  { onError }: { onError: (error: unknown) => void },
): GuardedAction<A> {
  const lock = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  // Không memo: `run` luôn đóng gói `action`/`onError` của lần render mới nhất; khoá nằm ở ref.
  const run = async (...args: A) => {
    if (lock.current) return false
    lock.current = true
    setPending(true)
    setError(null)
    try {
      await action(...args)
      return true
    } catch (e) {
      lock.current = false
      setPending(false)
      setError(e)
      onError(e)
      return false
    }
  }

  const reset = () => {
    lock.current = false
    setPending(false)
    setError(null)
  }

  return { run, pending, error, reset }
}
