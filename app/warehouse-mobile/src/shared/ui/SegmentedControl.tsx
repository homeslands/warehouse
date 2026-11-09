import { useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { haptics } from '@/shared/lib/haptics'
import { motion } from '@/shared/lib/motion'
import { useTheme } from '@/shared/theme/useTheme'

import { Text } from './Text'

export type SegmentedControlProps<T extends string> = {
  /** `label` đã dịch sẵn (shared/ui không dùng i18n). */
  items: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  testID?: string
}

const PAD = 3

/**
 * Segmented control kiểu iOS: rãnh `fill`, con trượt `segmentThumb` trượt sang mục được chọn
 * (~220ms). Lần hiện đầu không trượt; Reduce Motion: đổi tức thì.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const [segment, setSegment] = useState(0)
  const index = items.findIndex((i) => i.value === value)
  const x = useSharedValue(0)
  const shown = useRef({ index, segment })

  useEffect(() => {
    const to = index * segment
    // Đo lại (lần đầu, xoay máy) thì đặt thẳng; chỉ trượt khi đổi mục.
    const animate = !reduced && shown.current.index !== index && shown.current.segment === segment
    shown.current = { index, segment }
    x.value = animate ? withTiming(to, { duration: motion.select, easing: motion.easeOut }) : to
  }, [index, segment, reduced, x])

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      onLayout={(e) => setSegment((e.nativeEvent.layout.width - PAD * 2) / items.length)}
      style={{ flexDirection: 'row', padding: PAD, borderRadius: 10, backgroundColor: colors.fill }}
    >
      {segment > 0 ? (
        <Animated.View
          aria-hidden
          style={[
            {
              position: 'absolute',
              top: PAD,
              bottom: PAD,
              left: PAD,
              width: segment,
              borderRadius: 8,
              backgroundColor: colors.segmentThumb,
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            },
            thumb,
          ]}
        />
      ) : null}
      {items.map((item) => {
        const selected = item.value === value
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return
              haptics.selection()
              onChange(item.value)
            }}
            style={{ flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              weight={selected ? 'semibold' : 'medium'}
              size={13}
              numberOfLines={1}
              style={{ color: selected ? colors.foreground : colors.mutedForeground }}
            >
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
