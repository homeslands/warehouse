import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  View,
  type ScrollViewInstance,
  type ScrollViewProps,
  type ViewInstance,
} from 'react-native'
import { initialWindowMetrics } from 'react-native-safe-area-context'

import { KeyboardRevealContext, keyboardScrollProps, useKeyboardReveal } from '../lib/keyboard'

/**
 * Tránh bàn phím cho phần thân màn / sheet (ô cuộn + nút ghim đáy nếu có):
 * - Android (edge-to-edge: cửa sổ không tự co khi có bàn phím): `KeyboardAvoidingView` `padding`. KAV
 *   chỉ biết khung của nó TRONG CHA nên dưới header nó tính thiếu đúng bằng khoảng cách từ đỉnh cửa sổ →
 *   `keyboardVerticalOffset` = vị trí trên cửa sổ của khung bọc (đo lúc layout).
 * - iOS: mặc định không bọc gì (ScrollView tự chừa đáy — `keyboardScrollProps`). `onIOS` (vùng có nút
 *   ghim đáy, vd `SheetScaffold` của bộ chọn vật tư): chừa đáy = phần bàn phím nhô lên trên mép dưới màn
 *   hình trừ vùng an toàn đáy — KHÔNG đo vị trí: trong formSheet `measureInWindow` tính từ mép trên của
 *   sheet (RN Screens báo gốc 0 cho modal gốc), lệch đúng khoảng sheet cách đỉnh màn. Giả định khung
 *   chạm đáy màn (sheet hết cỡ, `Screen` chừa vùng an toàn đáy).
 */
export function KeyboardAvoider({
  children,
  onIOS = false,
}: {
  children: ReactNode
  onIOS?: boolean
}) {
  if (Platform.OS === 'ios')
    return onIOS ? <IOSPinnedAvoider>{children}</IOSPinnedAvoider> : children
  return <AndroidAvoider>{children}</AndroidAvoider>
}

function AndroidAvoider({ children }: { children: ReactNode }) {
  const frame = useRef<ViewInstance>(null)
  const [offset, setOffset] = useState(0)
  return (
    <View
      ref={frame}
      testID="keyboard-avoider"
      style={{ flex: 1 }}
      onLayout={() => frame.current?.measureInWindow((_x, y) => setOffset(y))}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={offset}>
        {children}
      </KeyboardAvoidingView>
    </View>
  )
}

function IOSPinnedAvoider({ children }: { children: ReactNode }) {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      // Ẩn bàn phím cũng là một lần đổi khung (mép trên = đáy màn → 0).
      const above = Math.max(0, Dimensions.get('screen').height - e.endCoordinates.screenY)
      const next = Math.max(0, above - (initialWindowMetrics?.insets.bottom ?? 0))
      if (e.duration) {
        LayoutAnimation.configureNext({
          duration: e.duration,
          update: { duration: e.duration, type: LayoutAnimation.Types.keyboard },
        })
      }
      setInset(next)
    })
    return () => sub.remove()
  }, [])
  return (
    <View testID="keyboard-avoider" style={{ flex: 1, paddingBottom: inset }}>
      {children}
    </View>
  )
}

export type FormScrollViewProps = ScrollViewProps & {
  ref?: Ref<ScrollViewInstance>
  /** Nội dung ghim dưới vùng cuộn (vd nút chính) — nổi lên trên bàn phím trên cả hai nền tảng. */
  bottom?: ReactNode
  /** Chiều cao phần nổi ngay trên bàn phím do màn tự đặt (vd `WizardBottomBar avoidKeyboard`). */
  aboveKeyboard?: number
}

/**
 * Vùng cuộn chuẩn của form (màn tạo phiếu nhập / xuất, `SheetScaffold`): tránh bàn phím theo
 * `KeyboardAvoider` + `keyboardScrollProps`, và ô nào (`FormField`, hoặc ô tự gọi `useRevealInput`)
 * nhận focus mà bị bàn phím che thì được cuộn lên trên bàn phím (`useKeyboardReveal`).
 */
export function FormScrollView({
  ref,
  bottom,
  aboveKeyboard = 0,
  children,
  onScroll,
  ...rest
}: FormScrollViewProps) {
  const scroll = useRef<ScrollViewInstance | null>(null)
  const setRef = useCallback(
    (node: ScrollViewInstance | null) => {
      scroll.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  const { reveal, onScroll: track } = useKeyboardReveal(
    (y) => scroll.current?.scrollTo({ y, animated: true }),
    aboveKeyboard,
  )
  const pinned = bottom !== undefined && bottom !== null
  return (
    <KeyboardAvoider onIOS={pinned}>
      <ScrollView
        ref={setRef}
        {...keyboardScrollProps({ avoided: pinned })}
        scrollEventThrottle={16}
        onScroll={(e) => {
          track(e)
          onScroll?.(e)
        }}
        {...rest}
      >
        <KeyboardRevealContext value={reveal}>{children}</KeyboardRevealContext>
      </ScrollView>
      {bottom}
    </KeyboardAvoider>
  )
}
