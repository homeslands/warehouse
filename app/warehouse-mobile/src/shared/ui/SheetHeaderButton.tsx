import { Check, X } from './icons'
import { ActivityIndicator, Pressable } from 'react-native'

import { useTheme } from '../theme/useTheme'

export type DoneState = 'idle' | 'busy' | 'success'

export type SheetHeaderButtonProps = {
  kind: 'cancel' | 'done'
  label: string
  onPress: () => void
  disabled?: boolean
  /** Chỉ cho `done`: `busy` → vòng quay. */
  busy?: boolean
}

const SIZE = 40

/**
 * Nút tròn ✕ / ✓ trên header native của sheet — CHỈ Android (`headerLeft`/`headerRight`). iOS dùng mục
 * thanh điều hướng gốc (`unstable_headerLeftItems`/`unstable_headerRightItems`, hệ thống vẽ kính).
 */
export function SheetHeaderButton({
  kind,
  label,
  onPress,
  disabled,
  busy,
}: SheetHeaderButtonProps) {
  const { colors } = useTheme()
  const done = kind === 'done'
  const fg = done ? colors.primaryForeground : colors.foreground
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        backgroundColor: done ? colors.primary : colors.fill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled && !busy ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : done ? (
        <Check size={20} color={fg} strokeWidth={2.4} aria-hidden />
      ) : (
        <X size={20} color={fg} strokeWidth={2.2} aria-hidden />
      )}
    </Pressable>
  )
}
