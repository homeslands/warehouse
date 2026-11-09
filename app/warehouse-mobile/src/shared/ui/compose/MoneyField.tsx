import { useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput, View, type TextInputInstance } from 'react-native'

import { numericStyle } from '../../theme/fonts'
import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'

export type MoneyFieldProps = {
  /** Chữ ĐÃ ngăn nghìn (màn áp `formatMoneyInput` lên chữ vừa gõ trong `onChangeText`). */
  value: string
  onChangeText: (s: string) => void
  onFocus?: () => void
  onBlur?: () => void
  unitLabel: string
  state: 'normal' | 'missing' | 'muted'
  placeholder: string
  accessibilityLabel: string
  inputAccessoryViewID?: string
  inputRef?: Ref<TextInputInstance>
  editable?: boolean
  testID?: string
  /** `plain`: không viền, nền trong suốt (nền `fill` khi focus) — ô trong dòng kiểu Cài đặt iOS. */
  variant?: 'framed' | 'plain'
}

/**
 * Ô đơn giá kiểu ví điện tử: khung bo 9 [ô gõ][ đ / <đv>] — hậu tố cố định nằm NGOÀI vùng gõ. Con trỏ luôn
 * ở cuối chữ (không cho đặt giữa số đã ngăn nghìn). Focus → viền accent 1.5pt nền card; thiếu → viền cam
 * nền `warningSoft`; `muted` → chữ mờ (giá 0 hợp lệ).
 */
export function MoneyField({
  value,
  onChangeText,
  onFocus,
  onBlur,
  unitLabel,
  state,
  placeholder,
  accessibilityLabel,
  inputAccessoryViewID,
  inputRef,
  editable = true,
  testID,
  variant = 'framed',
}: MoneyFieldProps) {
  const { colors } = useTheme()
  const { t } = useTranslation('common')
  const [focused, setFocused] = useState(false)
  const missing = state === 'missing'
  const plain = variant === 'plain'
  const borderColor = focused ? colors.accent : missing ? colors.warning : colors.separator
  const textColor = missing
    ? colors.warningText
    : state === 'muted'
      ? colors.mutedForeground
      : colors.foreground
  return (
    <View
      testID={testID ? `${testID}-frame` : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
        paddingHorizontal: 9,
        borderRadius: 9,
        ...(plain
          ? {
              justifyContent: 'flex-end',
              backgroundColor: missing ? colors.warningSoft : focused ? colors.fill : 'transparent',
            }
          : {
              borderWidth: focused ? 1.5 : 1,
              borderColor,
              backgroundColor: focused ? colors.card : missing ? colors.warningSoft : 'transparent',
            }),
      }}
    >
      <TextInput
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true)
          onFocus?.()
        }}
        onBlur={() => {
          setFocused(false)
          onBlur?.()
        }}
        selection={{ start: value.length, end: value.length }}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={missing ? colors.warningText : colors.mutedForeground}
        accessibilityLabel={accessibilityLabel}
        inputAccessoryViewID={inputAccessoryViewID}
        editable={editable}
        selectTextOnFocus={false}
        style={[
          numericStyle(focused || missing ? 'semibold' : 'regular'),
          {
            flexShrink: 1,
            minWidth: 56,
            fontSize: plain ? 17 : 14,
            paddingVertical: 8,
            color: textColor,
            textAlign: 'right',
          },
        ]}
      />
      <Text
        numeric
        size={13}
        numberOfLines={1}
        style={{ marginLeft: 3, color: missing ? colors.warningText : colors.mutedForeground }}
      >
        {t('compose.price.suffix', { unit: unitLabel })}
      </Text>
    </View>
  )
}
