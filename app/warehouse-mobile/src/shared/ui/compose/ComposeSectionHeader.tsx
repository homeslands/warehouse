import { Pressable, View } from 'react-native'

import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'

export type ComposeSectionHeaderProps = {
  title: string
  action?: {
    label: string
    /** Nhãn cho trình đọc màn hình khi chữ trên nút chưa đủ nghĩa (vd hai nút "Sửa" của bước 3). */
    accessibilityLabel?: string
    onPress: () => void
    testID?: string
    disabled?: boolean
  }
  testID?: string
}

/**
 * Tiêu đề khối nhóm kiểu Cài đặt (spec wizard-apple §8; cùng kiểu với tiêu đề "Vật tư · n" của bước 2):
 * chữ 13 `groupedLabel` lùi 18 ở trái + nút chữ `accentText` ở phải (vd "Sửa" của bước 3, ≥ 44pt).
 */
export function ComposeSectionHeader({ title, action, testID }: ComposeSectionHeaderProps) {
  const { colors } = useTheme()
  return (
    <View
      testID={testID}
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingLeft: 18,
        paddingRight: 16,
        paddingBottom: 7,
      }}
    >
      <Text
        size={13}
        accessibilityRole="header"
        style={{ flexShrink: 1, color: colors.groupedLabel }}
      >
        {title}
      </Text>
      {action ? (
        <Pressable
          testID={action.testID}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          accessibilityState={{ disabled: !!action.disabled }}
          disabled={action.disabled}
          hitSlop={8}
          onPress={action.onPress}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: 'flex-end',
            // Chữ "Sửa" thẳng hàng chân với tiêu đề; vùng chạm cao 44 nhô lên trên.
            marginBottom: -7,
            paddingBottom: 7,
            paddingLeft: 12,
            opacity: action.disabled ? 0.4 : pressed ? 0.6 : 1,
          })}
        >
          <Text size={15} style={{ color: colors.accentText }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
