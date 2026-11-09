import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import {
  Keyboard,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native'

/** Khoảng chừa giữa đáy ô đang nhập và mép trên bàn phím. */
const REVEAL_MARGIN = 16
/** Bàn phím chưa hiện lúc ô nhận focus: chờ `keyboardDidShow` tối đa chừng này (bàn phím rời không hiện). */
const WAIT_KEYBOARD_MS = 1000
/** Sau `keyboardDidShow`: chờ khung (Android: KAV vừa co lại) dựng xong rồi mới đo. */
const SETTLE_MS = 100

/** Thứ đo được vị trí trên cửa sổ — `TextInput` / `View` thật. */
export type Measurable = {
  measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void
}

/**
 * Props bàn phím chung cho vùng cuộn có ô nhập (màn tạo phiếu, sheet, danh sách dòng có ô số):
 * - iOS: `automaticallyAdjustKeyboardInsets` (hệ thống chừa đáy theo bàn phím, tính theo toạ độ cửa sổ
 *   nên đúng cả dưới header / trong sheet) + `keyboardDismissMode="interactive"` (kéo xuống là kéo bàn
 *   phím theo, cuộn lên tìm ô không đóng bàn phím). `avoided`: khung đã được `KeyboardAvoidingView` co
 *   lại (vùng có nút ghim đáy) → tắt chừa đáy tự động để không chừa hai lần.
 * - Android: `keyboardDismissMode="none"` (cuộn để tới ô không đóng bàn phím); tránh bàn phím do
 *   `KeyboardAvoider` lo.
 */
export function keyboardScrollProps({ avoided = false }: { avoided?: boolean } = {}): Pick<
  ScrollViewProps,
  'automaticallyAdjustKeyboardInsets' | 'keyboardDismissMode' | 'keyboardShouldPersistTaps'
> {
  return Platform.OS === 'ios'
    ? {
        automaticallyAdjustKeyboardInsets: !avoided,
        keyboardDismissMode: 'interactive',
        keyboardShouldPersistTaps: 'handled',
      }
    : { keyboardDismissMode: 'none', keyboardShouldPersistTaps: 'handled' }
}

/** Ô nhập gọi khi nhận focus để vùng cuộn chứa nó đưa nó lên trên bàn phím (xem `useKeyboardReveal`). */
export type RevealInput = (target: Measurable) => void

export const KeyboardRevealContext = createContext<RevealInput | null>(null)

/** Hàm "đưa ô lên trên bàn phím" của vùng cuộn gần nhất (không nằm trong vùng nào → `null`). */
export const useRevealInput = () => useContext(KeyboardRevealContext)

/**
 * Đưa ô vừa nhận focus lên trên bàn phím: đo ô theo toạ độ cửa sổ (`measureInWindow`), so với mép trên
 * bàn phím (`Keyboard.metrics()`), bị che thì cuộn thêm đúng phần bị che (+16). Chỉ cuộn khi bị che — ô
 * đang thấy thì không động gì (hệ thống iOS / ScrollView Android đã tự cuộn trước thì lần đo này thấy
 * không còn che, không cuộn lần hai). Bàn phím chưa hiện → chờ `keyboardDidShow` rồi đo. Trong formSheet
 * iOS, `measureInWindow` tính từ mép trên của sheet (RN Screens báo gốc 0 cho modal) nên phép đo này
 * chỉ có thể THIẾU (không bao giờ cuộn quá) — ở đó iOS tự đưa ô lên nhờ `automaticallyAdjustKeyboardInsets`.
 *
 * `scrollToY`: cuộn vùng cuộn tới vị trí dọc (ScrollView `scrollTo`, FlatList `scrollToOffset`). Gắn
 * `onScroll` trả về vào vùng cuộn (cần vị trí cuộn hiện tại) với `scrollEventThrottle`.
 */
export function useKeyboardReveal(
  scrollToY: (y: number) => void,
  /** Phần nổi ngay trên bàn phím (vd thanh đáy được nâng lên) — ô nằm dưới nó cũng coi là bị che. */
  aboveKeyboard = 0,
): {
  reveal: RevealInput
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
} {
  const offsetY = useRef(0)
  const scrollRef = useRef(scrollToY)
  const aboveRef = useRef(aboveKeyboard)
  useEffect(() => {
    scrollRef.current = scrollToY
    aboveRef.current = aboveKeyboard
  })
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y
  }, [])
  // Lần chờ bàn phím đang treo (listener + hẹn giờ): lần focus sau thay lần trước, rời màn thì gỡ.
  const waiting = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      waiting.current?.()
      waiting.current = null
    },
    [],
  )
  const reveal = useCallback<RevealInput>((target) => {
    const measure = () => {
      const kb = Keyboard.metrics()
      if (!kb) return
      target.measureInWindow((_x, y, _w, h) => {
        const covered = y + h + REVEAL_MARGIN - (kb.screenY - aboveRef.current)
        if (covered > 0) scrollRef.current(offsetY.current + covered)
      })
    }
    waiting.current?.()
    waiting.current = null
    if (Keyboard.isVisible()) {
      requestAnimationFrame(measure)
      return
    }
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      stop()
      setTimeout(measure, SETTLE_MS)
    })
    const timer = setTimeout(() => stop(), WAIT_KEYBOARD_MS)
    function stop() {
      sub.remove()
      clearTimeout(timer)
      if (waiting.current === stop) waiting.current = null
    }
    waiting.current = stop
  }, [])
  return { reveal, onScroll }
}
