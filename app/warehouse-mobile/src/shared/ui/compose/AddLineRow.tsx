import { Pressable, StyleSheet, View } from 'react-native'

import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'
import { ROW_PRESS_DELAY_MS } from '../press'

export type AddLineRowProps = {
  /** Đã dịch, vd "Thêm vật tư". */
  label: string
  onPress: () => void
  disabled?: boolean
  /** Khối chưa có dòng nào: dòng này là dòng đầu — bo trên, không kẻ trên. */
  first?: boolean
  testID?: string
}

/**
 * Dòng CUỐI của khối "Vật tư · n" ở bước 2 (spec wizard-apple §6, kiểu Lời nhắc iOS): "⊕ Thêm vật tư" —
 * vòng tròn `accent` 24 có dấu + rồi chữ `accent` 17; cao ≥ 50, kẻ mảnh phía trên (trừ khi `first`),
 * nền `card`, luôn bo dưới. Nhấn → nền `cellPressed`; `disabled` → mờ, không bấm được.
 */
export function AddLineRow({ label, onPress, disabled, first, testID }: AddLineRowProps) {
  const { colors, radius } = useTheme()
  const tint = disabled ? colors.mutedForeground : colors.accent
  const top = first ? radius.groupLarge : 0
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      style={({ pressed }) => ({
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        paddingHorizontal: 18,
        backgroundColor: pressed ? colors.cellPressed : colors.card,
        borderTopLeftRadius: top,
        borderTopRightRadius: top,
        borderBottomLeftRadius: radius.groupLarge,
        borderBottomRightRadius: radius.groupLarge,
      })}
    >
      {first ? null : (
        <View
          testID={testID ? `${testID}-hairline` : undefined}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.separator,
          }}
        />
      )}
      <View
        testID={testID ? `${testID}-icon` : undefined}
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Vòng cố định 24pt: dấu + không phóng theo cỡ chữ hệ thống (nhãn bên cạnh vẫn phóng). */}
        <Text
          allowFontScaling={false}
          size={17}
          weight="semibold"
          style={{ color: colors.accentForeground, lineHeight: 20 }}
        >
          +
        </Text>
      </View>
      <Text size={17} style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  )
}
