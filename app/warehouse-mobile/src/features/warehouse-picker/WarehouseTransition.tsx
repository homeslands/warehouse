import { useEffect, useRef, type ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { useWarehouseStore } from '@/entities/warehouse'
import { motion } from '@/shared/lib/motion'

export type WarehouseTransitionProps = {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * Bọc nội dung phụ thuộc kho đang chọn: đổi kho → nội dung mờ 0.6 rồi hiện lại (~250ms) để người
 * dùng thấy dữ liệu vừa được làm mới. Lần hiện đầu không có hiệu ứng. Reduce Motion: bỏ hẳn.
 */
export function WarehouseTransition({ children, style }: WarehouseTransitionProps) {
  const slug = useWarehouseStore((s) => s.current?.slug)
  const reduced = useReducedMotion()
  const opacity = useSharedValue(1)
  const shownSlug = useRef(slug)

  useEffect(() => {
    if (slug === shownSlug.current) return
    shownSlug.current = slug
    if (reduced) return
    opacity.value = 0.6
    opacity.value = withTiming(1, { duration: motion.content, easing: motion.easeOut })
  }, [slug, reduced, opacity])

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View testID="warehouse-transition" style={[style, animated]}>
      {children}
    </Animated.View>
  )
}
