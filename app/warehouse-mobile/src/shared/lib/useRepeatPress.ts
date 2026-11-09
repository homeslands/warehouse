import { useCallback, useEffect, useRef } from 'react'

/**
 * Nút bước (+ / −) bấm một lần hoặc giữ để lặp — trải các prop trả về lên `Pressable`:
 * - `onPress` bước ĐÚNG một lần. Pressability chỉ gọi nó khi nhả tay bình thường (một lần cuộn bắt đầu
 *   trên nút huỷ chạm → không gọi; TalkBack Android kích hoạt nút qua `onClick` → chỉ gọi `onPress`).
 * - `onLongPress` (sau `delayLongPress` = `delayMs`) bước rồi lặp, khoảng cách giảm dần từ `intervalMs`
 *   tới `minIntervalMs` (mỗi lần × 0.85). Sau long press Pressability KHÔNG gọi `onPress` nữa.
 * - `onPressOut`, tháo màn hoặc `disabled` → dừng lặp.
 * `onStep` trả `false` → dừng lặp (kể cả ngay ở lần bước đầu của long press).
 */
export function useRepeatPress(
  onStep: () => void | boolean,
  opts: { delayMs?: number; intervalMs?: number; minIntervalMs?: number; disabled?: boolean } = {},
) {
  const { delayMs = 400, intervalMs = 150, minIntervalMs = 60, disabled = false } = opts
  const stepRef = useRef(onStep)
  useEffect(() => {
    stepRef.current = onStep
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => stop, [stop])
  useEffect(() => {
    if (disabled) stop()
  }, [disabled, stop])

  const onPress = useCallback(() => {
    if (disabled) return
    stop()
    stepRef.current()
  }, [disabled, stop])

  const onLongPress = useCallback(() => {
    if (disabled) return
    stop()
    if (stepRef.current() === false) return
    const tick = (gap: number) => {
      timer.current = setTimeout(() => {
        if (stepRef.current() === false) return
        tick(Math.max(minIntervalMs, Math.round(gap * 0.85)))
      }, gap)
    }
    tick(intervalMs)
  }, [disabled, stop, intervalMs, minIntervalMs])

  return { onPress, onLongPress, onPressOut: stop, delayLongPress: delayMs }
}
