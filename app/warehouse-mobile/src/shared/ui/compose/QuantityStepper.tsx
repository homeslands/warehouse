import { useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native'

import { haptics } from '../../lib/haptics'
import { useRepeatPress } from '../../lib/useRepeatPress'
import { numericStyle } from '../../theme/fonts'
import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'

export type QuantityStepperProps = {
  text: string
  onChangeText: (s: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onStep: (delta: 1 | -1) => void
  onRequestRemove: () => void
  value: number
  missing: boolean
  disabled: boolean
  unitLabel: string
  accessibilityLabel: string
  inputAccessoryViewID?: string
  inputRef?: Ref<TextInputInstance>
  testID?: string
  /** `large`: cỡ to của sheet sửa dòng (nút 48×44, số 22 đậm). Mặc định `regular` (thẻ). */
  size?: 'regular' | 'large'
  /**
   * `ios`: kiểu Cài đặt iOS — ô số có nền `fill` (gõ được) đứng CẠNH viên UIStepper xám [−|+] 94×32; số KHÔNG
   * nằm trong viên. Luật bấm / giữ / ô gõ giữ nguyên; `size` bị bỏ qua. `accessibilityLabel` là nhãn ô số nguyên văn.
   */
  variant?: 'classic' | 'ios'
}

/** Kích thước theo cỡ; luật bấm / giữ / ô gõ giống hệt nhau. */
const SIZES = {
  // Nút 34×32 + `hitSlop` = vùng chạm 44×44.
  regular: {
    button: { width: 34, height: 32 },
    hit: { top: 6, bottom: 6, left: 5, right: 5 },
    glyph: 18,
    input: { minWidth: 40, height: 32, fontSize: 14 },
  },
  large: {
    button: { width: 48, height: 44 },
    hit: undefined,
    glyph: 24,
    input: { minWidth: 64, height: 44, fontSize: 22 },
  },
} as const

/**
 * Bộ chọn số lượng kiểu giỏ hàng: viên viền [−][ô số][+]. Ô số gõ được ("chạm số để gõ"); chạm nút = bước
 * MỘT lần khi nhả tay (`onPress` — lần cuộn bắt đầu trên nút không bước; TalkBack kích hoạt được), giữ
 * ≥ 400ms thì lặp tới khi nhả (`useRepeatPress`); "−" ở số ≤ 1 → `onRequestRemove` (màn hỏi xoá dòng),
 * không giảm tiếp. `size="large"` chỉ đổi kích thước (sheet sửa dòng).
 */
export function QuantityStepper({
  text,
  onChangeText,
  onFocus,
  onBlur,
  onStep,
  onRequestRemove,
  value,
  missing,
  disabled,
  unitLabel,
  accessibilityLabel,
  inputAccessoryViewID,
  inputRef,
  testID,
  size = 'regular',
  variant = 'classic',
}: QuantityStepperProps) {
  const { colors } = useTheme()
  const dims = SIZES[size]
  const { t } = useTranslation('common')
  // Ô trống lúc mới mở / đang gõ trông như ô bình thường ("0" mờ); chỉ báo cam khi đã rời ô mà vẫn trống.
  const [left, setLeft] = useState(false)
  const warn = missing && left
  const focus = () => {
    setLeft(false)
    onFocus?.()
  }
  const blur = () => {
    setLeft(true)
    onBlur?.()
  }

  const inc = () => {
    haptics.selection()
    onStep(1)
  }
  // "−" ở số ≤ 1 hỏi xoá rồi trả `false` để `useRepeatPress` dừng lặp: tối đa MỘT lần hỏi mỗi lần nhấn.
  const dec = () => {
    if (value <= 1) {
      onRequestRemove()
      return false
    }
    haptics.selection()
    onStep(-1)
    return true
  }
  const plus = useRepeatPress(inc, { disabled })
  const minus = useRepeatPress(dec, { disabled })

  const button = (label: string, glyph: string, press: ReturnType<typeof useRepeatPress>) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={dims.hit}
      onPress={press.onPress}
      onLongPress={press.onLongPress}
      onPressOut={press.onPressOut}
      delayLongPress={press.delayLongPress}
      style={{ ...dims.button, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text size={dims.glyph} style={{ color: disabled ? colors.mutedForeground : colors.accent }}>
        {glyph}
      </Text>
    </Pressable>
  )

  const onAction = (e: { nativeEvent: { actionName: string } }) => {
    if (disabled) return
    if (e.nativeEvent.actionName === 'increment') inc()
    else if (e.nativeEvent.actionName === 'decrement') dec()
  }

  if (variant === 'ios') {
    // Mỗi nửa 47×32 + hitSlop dọc 6 = vùng chạm 47×44.
    const half = (label: string, glyph: string, press: ReturnType<typeof useRepeatPress>) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={{ top: 6, bottom: 6 }}
        onPress={press.onPress}
        onLongPress={press.onLongPress}
        onPressOut={press.onPressOut}
        delayLongPress={press.delayLongPress}
        style={{ width: 47, height: 32, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text
          size={22}
          style={{ color: disabled ? colors.mutedForeground : colors.accent, lineHeight: 26 }}
        >
          {glyph}
        </Text>
      </Pressable>
    )
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TextInput
          ref={inputRef}
          testID={testID}
          value={text}
          onChangeText={onChangeText}
          onFocus={focus}
          onBlur={blur}
          keyboardType="decimal-pad"
          placeholder={missing ? t('compose.qty.placeholder') : undefined}
          placeholderTextColor={warn ? colors.warningText : colors.mutedForeground}
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ text: text === '' ? undefined : `${text} ${unitLabel}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onAction}
          inputAccessoryViewID={inputAccessoryViewID}
          editable={!disabled}
          selectTextOnFocus
          style={[
            numericStyle('semibold'),
            {
              minWidth: 64,
              height: 36,
              paddingVertical: 0,
              paddingHorizontal: 10,
              borderRadius: 8,
              fontSize: 17,
              textAlign: 'right',
              backgroundColor: warn ? colors.warningSoft : colors.fill,
              color: warn ? colors.warningText : colors.foreground,
            },
          ]}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: 94,
            height: 32,
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: colors.fill,
          }}
        >
          {half(t('compose.qty.decrease'), '−', minus)}
          <View
            testID={testID ? `${testID}-divider` : undefined}
            style={{
              width: StyleSheet.hairlineWidth,
              height: 18,
              backgroundColor: colors.separator,
            }}
          />
          {half(t('compose.qty.increase'), '+', plus)}
        </View>
      </View>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: warn ? colors.warning : colors.separator,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: warn ? colors.warningSoft : 'transparent',
      }}
    >
      {button(t('compose.qty.decrease'), '−', minus)}
      <TextInput
        ref={inputRef}
        testID={testID}
        value={text}
        onChangeText={onChangeText}
        onFocus={focus}
        onBlur={blur}
        keyboardType="decimal-pad"
        placeholder={missing ? t('compose.qty.placeholder') : undefined}
        placeholderTextColor={warn ? colors.warningText : colors.mutedForeground}
        accessibilityLabel={`${accessibilityLabel} (${unitLabel})`}
        accessibilityValue={{ text: text === '' ? undefined : `${text} ${unitLabel}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        inputAccessoryViewID={inputAccessoryViewID}
        editable={!disabled}
        style={[
          numericStyle('bold'),
          {
            ...dims.input,
            paddingVertical: 0,
            paddingHorizontal: 4,
            textAlign: 'center',
            color: warn ? colors.warningText : colors.foreground,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: warn ? colors.warning : colors.separator,
          },
        ]}
      />
      {button(t('compose.qty.increase'), '+', plus)}
    </View>
  )
}
