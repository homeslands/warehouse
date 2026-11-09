import { Pressable } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

/** Viên lựa chọn một-trong-nhiều: cao 36 + `hitSlop` 4 trên/dưới = vùng chạm 44. */
export function OptionPill({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
      style={({ pressed }) => ({
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: 18,
        // Trên nền kính của sheet: nền đặc + viền để viên không chìm; đang chọn nền primary (đen / sáng ở dark).
        backgroundColor: selected ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        weight={selected ? 'semibold' : 'regular'}
        size={14}
        style={{ color: selected ? colors.primaryForeground : colors.foreground }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
