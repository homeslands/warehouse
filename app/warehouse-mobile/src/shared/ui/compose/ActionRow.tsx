import { Pressable, StyleSheet, View } from 'react-native'

import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'
import { ROW_PRESS_DELAY_MS } from '../press'

export type ActionRowProps = {
  label: string
  /** Màu chữ khi bấm được (vd `destructive` cho "Xoá khỏi phiếu", `accentText` cho "Xoá hạn"). */
  color: string
  /** Khoá (vd đang ghi phiếu): chữ mờ, không bấm được, `accessibilityState.disabled`. */
  disabled?: boolean
  onPress: () => void
  /** `centered`: dòng một mình trong nhóm riêng (chữ giữa, không kẻ trên) — "Xoá khỏi phiếu" kiểu Cài đặt iOS. */
  variant?: 'row' | 'centered'
}

/**
 * Dòng hành động chữ màu trong khối nhóm của sheet sửa dòng (≥ 44pt, kẻ mảnh phía trên lùi 16, nhấn →
 * nền `rowPressed` tràn hết dòng): "Xoá khỏi phiếu" của `/export-line` và `/import-line?compose=1`, "Xoá
 * hạn" của sheet phiếu nhập.
 */
export function ActionRow({
  label,
  color,
  disabled = false,
  onPress,
  variant = 'row',
}: ActionRowProps) {
  const { colors } = useTheme()
  const centered = variant === 'centered'
  return (
    <View
      style={{
        marginLeft: centered ? 0 : 16,
        borderTopWidth: centered ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: colors.separator,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        unstable_pressDelay={ROW_PRESS_DELAY_MS}
        style={({ pressed }) => ({
          minHeight: 44,
          justifyContent: 'center',
          paddingRight: 14,
          marginLeft: centered ? 0 : -16,
          paddingLeft: centered ? 14 : 16,
          alignItems: centered ? 'center' : undefined,
          backgroundColor: pressed ? colors.rowPressed : undefined,
        })}
      >
        <Text style={{ color: disabled ? colors.mutedForeground : color }}>{label}</Text>
      </Pressable>
    </View>
  )
}
