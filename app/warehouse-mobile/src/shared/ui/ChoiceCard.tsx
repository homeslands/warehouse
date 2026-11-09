import { Check, type LucideIcon } from './icons'
import { useEffect, useRef, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { motion } from '../lib/motion'
import { useTheme } from '../theme/useTheme'
import { ROW_PRESS_DELAY_MS } from './press'
import { Text } from './Text'

export type ChoiceCardProps = {
  title: string
  /** Dòng phụ dưới tiêu đề (chuỗi → chữ xám; hoặc phần tử tự dựng, vd mã + chip). */
  subtitle?: ReactNode
  /** Ô vuông đầu thẻ: icon, hoặc chữ ngắn (vd "VI"). */
  leading?: { icon: LucideIcon } | { text: string }
  selected: boolean
  onPress: () => void
  accessibilityLabel?: string
  /** testID của khung thẻ (phần có màu nền/viền). */
  testID?: string
}

/** Thẻ chưa chọn không có nền (nằm thẳng trên nền kính của sheet); đang nhấn mới hiện `cellPressed`. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const RADIO = 24
const TILE = 32

/**
 * Thẻ chọn một-trong-nhiều trong sheet (kiểu iOS 26/27): bo 20, ô đầu thẻ, tiêu đề + dòng phụ, vòng
 * chọn bên phải. Chưa chọn: không nền (trên nền kính của sheet). Đang chọn: nền thẻ + viền 2pt primary, ô đầu thẻ đặc, radio đặc có dấu tích. Viền
 * 2pt luôn có (trong suốt khi chưa chọn) nên chọn/bỏ chọn không làm xê dịch.
 *
 * Chuyển động (~220ms, ease-out): màu nội suy theo `progress`; dấu tích nảy 0.6 → 1.08 → 1 CHỈ khi
 * đổi chưa chọn → chọn sau khi đã hiện (không nảy lúc mở sheet, dựng lại thẻ, bật/tắt Reduce Motion);
 * đang bấm thu nhỏ 0.98. Reduce Motion: đổi tức thì, không scale.
 */
export function ChoiceCard({
  title,
  subtitle,
  leading,
  selected,
  onPress,
  accessibilityLabel,
  testID,
}: ChoiceCardProps) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const progress = useSharedValue(selected ? 1 : 0)
  const pressed = useSharedValue(0)
  const checkScale = useSharedValue(1)
  const shownSelected = useRef(selected)

  useEffect(() => {
    const becameSelected = selected && !shownSelected.current
    shownSelected.current = selected
    const to = selected ? 1 : 0
    if (reduced) {
      progress.value = to
      checkScale.value = 1
      return
    }
    progress.value = withTiming(to, { duration: motion.select, easing: motion.easeOut })
    if (becameSelected) {
      checkScale.value = 0.6
      checkScale.value = withSequence(
        withTiming(1.08, { duration: 140, easing: motion.easeOut }),
        withTiming(1, { duration: 100 }),
      )
    }
  }, [selected, reduced, progress, checkScale])

  const { card, cellPressed, primary, border, radioRing } = colors
  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [interpolateColor(pressed.value, [0, 1], [TRANSPARENT, cellPressed]), card],
    ),
    borderColor: interpolateColor(progress.value, [0, 1], ['transparent', primary]),
    transform: [{ scale: reduced ? 1 : 1 - 0.02 * pressed.value }],
  }))
  const tileStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [card, primary]),
    borderColor: interpolateColor(progress.value, [0, 1], [border, primary]),
  }))
  const onLayer = useAnimatedStyle(() => ({ opacity: progress.value }))
  const offLayer = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: checkScale.value }],
  }))

  const press = (to: number) => {
    // `.set()` thay vì gán `.value`: tương thích React Compiler (docs Reanimated 4).
    pressed.set(reduced ? to : withSpring(to, { damping: 20, stiffness: 400 }))
  }

  const tileContent = (color: string) =>
    leading && 'icon' in leading ? (
      <leading.icon size={18} strokeWidth={1.9} color={color} />
    ) : leading ? (
      <Text code weight="semibold" size={12} style={{ color }}>
        {leading.text}
      </Text>
    ) : null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected }}
      onPress={onPress}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      onPressIn={() => press(1)}
      onPressOut={() => press(0)}
    >
      <Animated.View
        testID={testID}
        style={[
          {
            minHeight: 60,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 20,
            borderWidth: 2,
          },
          cardStyle,
        ]}
      >
        {leading ? (
          <Animated.View
            testID="choice-card-tile"
            aria-hidden
            style={[
              {
                width: TILE,
                height: TILE,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: StyleSheet.hairlineWidth,
              },
              tileStyle,
            ]}
          >
            {/* Hai lớp chồng nhau, mờ chéo: màu nội dung ô đổi theo nền ô. */}
            <Animated.View style={[StyleSheet.absoluteFill, centered, offLayer]}>
              {tileContent(colors.foreground)}
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, centered, onLayer]}>
              {tileContent(colors.primaryForeground)}
            </Animated.View>
          </Animated.View>
        ) : null}

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text weight="semibold" size={15.5} numberOfLines={1}>
            {title}
          </Text>
          {typeof subtitle === 'string' ? (
            <Text muted size={13} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )}
        </View>

        <View
          testID="choice-card-radio"
          aria-hidden
          style={{
            width: RADIO,
            height: RADIO,
            borderRadius: RADIO / 2,
            borderWidth: 2,
            borderColor: radioRing,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View
            testID="choice-card-radio-fill"
            style={[
              {
                position: 'absolute',
                top: -2,
                left: -2,
                width: RADIO,
                height: RADIO,
                borderRadius: RADIO / 2,
                backgroundColor: primary,
              },
              onLayer,
            ]}
          />
          <Animated.View style={checkStyle} testID="choice-card-check">
            <Check size={15} strokeWidth={3} color={colors.primaryForeground} />
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  )
}

const centered = { alignItems: 'center', justifyContent: 'center' } as const
