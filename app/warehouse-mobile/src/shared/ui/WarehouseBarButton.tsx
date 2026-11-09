import { ChevronDown, Warehouse } from './icons'
import { Pressable, View } from 'react-native'
import Animated, { FadeInDown, FadeOutUp, LayoutAnimationConfig } from 'react-native-reanimated'

import { motion } from '../lib/motion'
import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

// Tên cũ trượt lên + mờ đi, tên mới trượt vào từ dưới. Reduce Motion: builder mặc định theo cài đặt
// hệ thống (ReduceMotion.System) nên tự tắt.
const ENTER = FadeInDown.duration(motion.content).easing(motion.easeOut)
const EXIT = FadeOutUp.duration(motion.content).easing(motion.easeOut)

export type WarehouseBarButtonProps = {
  /** Tên ngắn hiện trên thanh (mã kho, không có thì tên). */
  label: string
  /** Vd "Kho: Kho Tổng, đổi kho". */
  accessibilityLabel: string
  onPress: () => void
}

/**
 * Nút kho ở góc trái thanh điều hướng: icon kho + tên ngắn + mũi tên xuống. KHÔNG tự vẽ nền: trên
 * iOS 26/27 nút nằm trong một mục `custom` của thanh nên hệ thống tự vẽ viên kính (Liquid Glass);
 * Android là nút phẳng trên header. Đổi kho → tên trượt/mờ sang tên mới; lần hiện đầu không có hiệu ứng.
 */
export function WarehouseBarButton({
  label,
  accessibilityLabel,
  onPress,
}: WarehouseBarButtonProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => ({
        minHeight: 36,
        maxWidth: 180,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Warehouse size={16} strokeWidth={2} color={colors.foreground} aria-hidden />
      <View style={{ flexShrink: 1, overflow: 'hidden' }}>
        <LayoutAnimationConfig skipEntering>
          <Animated.View key={label} entering={ENTER} exiting={EXIT}>
            <Text weight="semibold" size={15} numberOfLines={1}>
              {label}
            </Text>
          </Animated.View>
        </LayoutAnimationConfig>
      </View>
      <ChevronDown size={14} strokeWidth={2.2} color={colors.mutedForeground} aria-hidden />
    </Pressable>
  )
}
