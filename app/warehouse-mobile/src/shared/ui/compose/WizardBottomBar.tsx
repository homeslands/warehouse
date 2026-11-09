import { BlurView } from 'expo-blur'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  StyleSheet,
  View,
  type KeyboardEvent,
  type ViewInstance,
} from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useTheme } from '../../theme/useTheme'
import { Button, type ButtonProps } from '../Button'

export type WizardBottomBarProps = {
  /** Dòng tóm tắt (bước 1: "Còn thiếu: …"; bước 2: "n vật tư · k chưa đủ" + tổng; bước 3: "Tổng cộng"). */
  summary?: ReactNode
  /** Nút chính (`WizardMainButton`). */
  children: ReactNode
  /** Thông báo mức phiếu, trên cùng. */
  notice?: ReactNode
  /** Chiều cao phần nội dung (không gồm vùng an toàn đáy) — danh sách chừa đúng chừng này ở đáy. */
  onHeight?: (height: number) => void
  /** testID của thanh; nội dung là `${testID}-content`, lớp mờ iOS là `${testID}-material`. */
  testID?: string
  /**
   * Màn có ô nhập (bước 1): bàn phím hiện → thanh nâng lên sát mép trên bàn phím (nút chính không bị che).
   * `onLift` báo quãng nâng để vùng cuộn chừa thêm đáy.
   */
  avoidKeyboard?: boolean
  onLift?: (lift: number) => void
}

/**
 * Thanh đáy của các bước form 3 bước (spec wizard-apple §4), CÓ NỀN để nội dung cuộn bên dưới không đè
 * chữ: iOS vật liệu mờ hệ thống `BlurView` (`expo-blur`, có trong Expo Go SDK 58; tint
 * `systemChromeMaterial` sáng / tối theo theme), Android nền đặc `grouped` (BlurView Android mặc định chỉ
 * là lớp bán trong — chữ bên dưới vẫn lộ); kẻ mảnh 0.5 phía trên; đệm dọc 12 / ngang 18. Đặt tuyệt đối ở
 * đáy màn như `BottomDock`: iOS `SafeAreaView edges=['bottom']` (nền kéo xuống tận đáy, nội dung trên vùng
 * an toàn / thanh tab), Android `View` (NativeTabs đã chừa đáy). Danh sách iOS tự chừa vùng an toàn qua
 * `contentInsetAdjustmentBehavior="automatic"` nên `onHeight` báo chiều cao phần NỘI DUNG.
 */
export function WizardBottomBar({
  summary,
  children,
  notice,
  onHeight,
  testID = 'wizard-bottom-bar',
  avoidKeyboard = false,
  onLift,
}: WizardBottomBarProps) {
  const { colors, scheme } = useTheme()
  const ios = Platform.OS === 'ios'
  const { lift, contentRef, measureLift } = useKeyboardLift(avoidKeyboard, onLift)
  const Container = ios ? SafeAreaView : View
  const containerProps = ios ? { edges: ['bottom' as const] } : null
  return (
    <Container
      testID={testID}
      {...containerProps}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: lift,
        backgroundColor: ios ? undefined : colors.grouped,
        borderTopWidth: 0.5,
        borderTopColor: colors.separator,
      }}
    >
      {ios ? (
        <BlurView
          testID={`${testID}-material`}
          tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        ref={contentRef}
        testID={`${testID}-content`}
        onLayout={(e) => {
          onHeight?.(e.nativeEvent.layout.height)
          measureLift()
        }}
        style={{ gap: 8, paddingHorizontal: 18, paddingVertical: 12 }}
      >
        {notice}
        {summary}
        {children}
      </View>
    </Container>
  )
}

/**
 * Quãng nâng thanh đáy khi bàn phím hiện = phần nội dung thanh (không gồm vùng an toàn / thanh tab) bị
 * bàn phím che: `max(0, đáy nội dung − mép trên bàn phím)`, toạ độ cửa sổ. Đáy nội dung đo bằng
 * `measureInWindow` lúc CHƯA nâng — đo lại ở mỗi lần bàn phím hiện từ trạng thái chưa nâng. iOS `keyboardWillChangeFrame` (ẩn = mép trên ở đáy màn → 0), Android
 * `keyboardDidShow` / `keyboardDidHide`. Đổi vị trí theo nhịp bàn phím (`LayoutAnimation` kiểu `keyboard`);
 * Reduce Motion → đổi ngay. Tắt (`enabled` false) → luôn 0.
 */
function useKeyboardLift(enabled: boolean, onLift?: (lift: number) => void) {
  const reduced = useReducedMotion()
  const contentRef = useRef<ViewInstance>(null)
  const bottom = useRef<number | null>(null)
  const [value, setValue] = useState(0)
  const liftRef = useRef(0)
  const onLiftRef = useRef(onLift)
  useEffect(() => {
    onLiftRef.current = onLift
  })

  const measure = () => {
    if (!enabled || liftRef.current !== 0) return
    contentRef.current?.measureInWindow((_x, y, _w, h) => {
      if (liftRef.current === 0 && h > 0) bottom.current = y + h
    })
  }

  useEffect(() => {
    if (!enabled) return
    const apply = (next: number, duration?: number) => {
      if (next === liftRef.current) return
      if (!reduced) {
        LayoutAnimation.configureNext({
          duration: duration || 250,
          update: {
            duration: duration || 250,
            type:
              Platform.OS === 'ios'
                ? LayoutAnimation.Types.keyboard
                : LayoutAnimation.Types.easeOut,
          },
        })
      }
      liftRef.current = next
      setValue(next)
      onLiftRef.current?.(next)
    }
    const show = (e: KeyboardEvent) => {
      const top = e.endCoordinates.screenY
      const lift = (b: number) => apply(Math.max(0, b - top), e.duration)
      // Chưa nâng: đo LẠI đáy nội dung ngay lúc bàn phím hiện — số đo lúc màn mới dựng có thể chưa gồm phần
      // chừa cho thanh tab (vùng an toàn áp sau), làm thanh bị nâng quá cao đúng bằng phần đó.
      if (liftRef.current === 0 && contentRef.current) {
        contentRef.current.measureInWindow((_x, y, _w, h) => {
          if (h > 0) bottom.current = y + h
          if (bottom.current != null) lift(bottom.current)
        })
        return
      }
      if (bottom.current != null) lift(bottom.current)
    }
    const subs =
      Platform.OS === 'ios'
        ? [Keyboard.addListener('keyboardWillChangeFrame', show)]
        : [
            Keyboard.addListener('keyboardDidShow', show),
            Keyboard.addListener('keyboardDidHide', () => apply(0)),
          ]
    return () => {
      for (const sub of subs) sub.remove()
    }
  }, [enabled, reduced])

  return { lift: value, contentRef, measureLift: measure }
}

/** Chiều cao nút chính của thanh đáy (spec wizard-apple §4) — cao hơn viên thuốc 48pt mặc định. */
const MAIN_BUTTON_HEIGHT = 52

export type WizardMainButtonProps = Omit<ButtonProps, 'variant' | 'capsule' | 'style'>

/**
 * Nút chính của `WizardBottomBar` ("Tiếp tục" / "Gửi duyệt" / "Lưu phiếu nhập"): `Button` accent viên
 * thuốc 52pt (bo 26). Mọi luật của `Button` giữ nguyên (`blocked`, `loading`, khoá vẽ nền đặc); chỉ đổi
 * chiều cao ở đây để các nút viên thuốc khác vẫn 48pt.
 */
export function WizardMainButton(props: WizardMainButtonProps) {
  return (
    <Button
      variant="accent"
      capsule
      style={{ minHeight: MAIN_BUTTON_HEIGHT, borderRadius: MAIN_BUTTON_HEIGHT / 2 }}
      {...props}
    />
  )
}

export type WizardSideButtonProps = Omit<ButtonProps, 'capsule'>

/** Nút phụ cạnh nút chính (vd "Huỷ"): `Button` viên thuốc cao 52 như `WizardMainButton`, variant do màn chọn. */
export function WizardSideButton({ style, ...rest }: WizardSideButtonProps) {
  return (
    <Button
      capsule
      {...rest}
      style={(state) => [
        { minHeight: MAIN_BUTTON_HEIGHT, borderRadius: MAIN_BUTTON_HEIGHT / 2 },
        typeof style === 'function' ? style(state) : style,
      ]}
    />
  )
}
