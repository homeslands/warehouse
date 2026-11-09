import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, Switch, View, type LayoutChangeEvent } from 'react-native'
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated'

import { motion } from '@/shared/lib/motion'
import { useTheme } from '@/shared/theme/useTheme'
import { IconTile, Text } from '@/shared/ui'

/** Dòng đầu của thẻ (icon + nhãn + công tắc), như `ListRow large`. */
export const SECTION_HEADER_HEIGHT = 50

/**
 * Căn quang học trên iOS: hộp chữ SF cao hơn nét chữ (nét nằm thấp hơn tâm hộp ~0.1em) nên dù hàng đã
 * `alignItems: 'center'`, `UISwitch` trông cao hơn nhãn (người dùng thấy trên iOS 26). Dời phần vẽ xuống
 * bằng `translateY` — không đổi hộp layout. Android không cần.
 */
const SWITCH_OPTICAL_STYLE_IOS = { transform: [{ translateY: 2 }] }

const ENTER = FadeIn.duration(motion.select).easing(motion.easeOut)
const EXIT = FadeOut.duration(motion.select).easing(motion.easeOut)

/** Hiệu ứng mở/thu nội dung: mờ vào/ra; Reduce Motion → không hiệu ứng (đổi tức thì). */
export function expandAnimations(reduced: boolean) {
  return reduced ? {} : { entering: ENTER, exiting: EXIT }
}

export type FilterSectionProps = {
  icon: LucideIcon
  label: string
  on: boolean
  onToggle: (on: boolean) => void
  children?: ReactNode
  /** Vị trí của thẻ trong vùng cuộn của sheet (cuộn ô tìm vào tầm nhìn). */
  onLayout?: (e: LayoutChangeEvent) => void
  testID?: string
}

/**
 * Một bộ lọc trong sheet Lọc (kiểu Lời nhắc iOS): KHÔNG nền thẻ (nằm thẳng trên nền sheet, lề ngang lấy
 * của `SheetScaffold`), dòng đầu 50pt [ô icon, nhãn, công tắc]. BẬT → nội dung (lựa chọn) mở ra ngay
 * bên dưới đường kẻ mảnh, cách 10.
 * Công tắc màu `success` trên cả hai nền tảng; nhãn truy cập = nhãn của thẻ.
 */
export function FilterSection({
  icon,
  label,
  on,
  onToggle,
  children,
  onLayout,
  testID,
}: FilterSectionProps) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  return (
    <View testID={testID} onLayout={onLayout} style={{ marginBottom: 12 }}>
      <View
        testID={testID ? `${testID}-header` : undefined}
        style={{
          minHeight: SECTION_HEADER_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 0,
        }}
      >
        <IconTile icon={icon} size={30} />
        <Text numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        <Switch
          testID={testID ? `${testID}-switch` : undefined}
          accessibilityLabel={label}
          value={on}
          onValueChange={onToggle}
          trackColor={{ true: colors.success }}
          style={Platform.OS === 'ios' ? SWITCH_OPTICAL_STYLE_IOS : undefined}
        />
      </View>
      {on ? (
        <Animated.View
          {...expandAnimations(reduced)}
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.separator,
            paddingVertical: 12,
            gap: 10,
          }}
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  )
}
