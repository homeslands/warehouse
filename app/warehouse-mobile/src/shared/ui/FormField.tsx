import type { LucideIcon } from 'lucide-react-native'
import { useCallback, useRef, useState, type ReactNode, type Ref } from 'react'
import { TextInput, type TextInputInstance, type TextInputProps, View } from 'react-native'

import { useRevealInput } from '../lib/keyboard'
import { fontStyle } from '../theme/fonts'
import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

export type FormFieldProps = TextInputProps & {
  label: string
  error?: string
  /** Icon trước ô nhập (vd điện thoại, ổ khoá). */
  icon?: LucideIcon
  /** Nút nằm trong ô, bên phải (vd hiện/ẩn mật khẩu). Tự lo vùng chạm 44×44 của nó. */
  trailing?: ReactNode
  ref?: Ref<TextInputInstance>
}

/**
 * Ô nhập có nhãn phía trên. Đang nhập: viền đậm + vòng sáng; lỗi: viền đỏ + câu lỗi bên dưới. Nằm trong
 * `FormScrollView` / `SheetScaffold` thì nhận focus là được cuộn lên trên bàn phím nếu bị che.
 */
export function FormField({
  label,
  error,
  icon: Icon,
  trailing,
  style,
  ref,
  onFocus,
  onBlur,
  ...rest
}: FormFieldProps) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  const reveal = useRevealInput()
  const input = useRef<TextInputInstance | null>(null)
  const setRef = useCallback(
    (node: TextInputInstance | null) => {
      input.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  const borderColor = error ? colors.destructive : focused ? colors.primary : colors.input
  return (
    <View style={{ gap: 6 }}>
      <Text weight="semibold" size={12.5} style={{ marginLeft: 2, color: colors.fieldLabel }}>
        {label}
      </Text>
      <View
        testID="form-field-box"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 50,
          gap: 10,
          paddingLeft: Icon ? 12 : 0,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          boxShadow: focused ? `0 0 0 3px ${colors.ringSoft}` : undefined,
        }}
      >
        {Icon ? <Icon size={16} color={colors.mutedForeground} aria-hidden /> : null}
        <TextInput
          ref={setRef}
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedForeground}
          onFocus={(e) => {
            setFocused(true)
            if (reveal && input.current) reveal(input.current)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          style={[
            {
              flex: 1,
              minHeight: 48,
              paddingLeft: Icon ? 0 : 12,
              paddingRight: trailing ? 0 : 12,
              color: colors.foreground,
              ...fontStyle('regular'),
              fontSize: 16,
            },
            style,
          ]}
          {...rest}
        />
        {trailing}
      </View>
      {error ? (
        <Text
          size={13}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ color: colors.destructive }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}
