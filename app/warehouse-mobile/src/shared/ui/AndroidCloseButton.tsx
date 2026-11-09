import { X } from './icons'
import { Pressable } from 'react-native'

import { useTheme } from '../theme/useTheme'

/** Android: nút ✕ phẳng bên trái header (bước 1 của form 3 bước — thoát luồng), vùng chạm 44. */
export function AndroidCloseButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <X size={22} color={colors.foreground} aria-hidden />
    </Pressable>
  )
}
