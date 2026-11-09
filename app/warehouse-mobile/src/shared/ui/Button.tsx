import { ActivityIndicator, Pressable, type PressableProps, View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

/**
 * `secondaryDestructive`: nền thẻ đặc + chữ đỏ (nút phụ nguy hiểm cạnh nút chính, vd "Huỷ" cạnh
 * "Xác nhận"); đặc để không lộ danh sách cuộn bên dưới khi nổi.
 */
export type ButtonVariant =
  'primary' | 'outline' | 'ghost' | 'destructive' | 'accent' | 'secondaryDestructive'

export type ButtonProps = Omit<PressableProps, 'children'> & {
  variant?: ButtonVariant
  loading?: boolean
  /**
   * Viên thuốc 48pt (bo 24, chữ 15.5) cho nút nổi trên nội dung: khi khoá vẽ nền `fill` đặc + chữ mờ
   * thay vì giảm opacity (nút trong suốt sẽ lộ danh sách cuộn bên dưới).
   */
  capsule?: boolean
  /**
   * TRÔNG như khoá (cùng kiểu vẽ với `disabled`) nhưng VẪN bấm được và không báo `disabled` cho trình
   * đọc màn hình — nút "Tiếp tục" của form theo bước: bấm khi còn thiếu thì màn chỉ tới chỗ thiếu (nên
   * kèm `accessibilityHint` nói còn thiếu gì).
   */
  blocked?: boolean
  children: string
}

export function Button({
  variant = 'primary',
  loading,
  disabled,
  capsule = false,
  blocked = false,
  children,
  style,
  ...rest
}: ButtonProps) {
  const { colors, radius, scheme } = useTheme()
  const inactive = disabled || loading
  const looksInactive = inactive || blocked
  const bg = {
    primary: colors.primary,
    outline: 'transparent',
    ghost: 'transparent',
    destructive: colors.destructive,
    accent: colors.accent,
    secondaryDestructive: colors.card,
  }[variant]
  const fg = {
    primary: colors.primaryForeground,
    outline: colors.foreground,
    ghost: colors.mutedForeground,
    // Nền destructive tối (#ff6467) với chữ trắng chỉ ~2.9:1 → chữ tối ở dark mode.
    destructive: scheme === 'dark' ? '#0a0a0a' : '#ffffff',
    accent: colors.accentForeground,
    secondaryDestructive: colors.destructiveText,
  }[variant]
  // Viên thuốc khoá (không đang gửi): nền xám đặc, chữ mờ — vẫn đục hoàn toàn.
  const solidDisabled = capsule && looksInactive && !loading
  const background = solidDisabled ? colors.fill : bg
  const foreground = solidDisabled ? colors.mutedForeground : fg
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      style={(state) => [
        {
          minHeight: capsule ? 48 : 46,
          paddingHorizontal: capsule ? 18 : 16,
          borderRadius: capsule ? 24 : radius.xl - 2,
          backgroundColor: background,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: capsule
            ? !looksInactive && state.pressed
              ? 0.85
              : 1
            : looksInactive
              ? 0.5
              : state.pressed
                ? 0.85
                : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {loading ? <ActivityIndicator size="small" color={foreground} /> : null}
        <Text
          weight="semibold"
          size={capsule ? 15.5 : undefined}
          numberOfLines={capsule ? 1 : undefined}
          style={{ color: foreground }}
        >
          {children}
        </Text>
      </View>
    </Pressable>
  )
}
