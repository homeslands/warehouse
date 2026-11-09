import { CircleAlert, X } from './icons'
import { useEffect } from 'react'
import { AccessibilityInfo, Pressable, View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

/**
 * Thông báo lỗi mức phiếu của Lưu / Xác nhận, ghim ngay trên thanh đáy (ngoài danh sách); ✕ để đóng
 * (vùng chạm 44). Mỗi câu mới được đọc cho trình đọc màn hình. `action`: một nút gỡ rối ngay dưới câu
 * báo (vd "Bỏ thay đổi trên máy").
 */
export function ErrorNotice({
  message,
  onDismiss,
  dismissLabel,
  action,
  testID = 'error-notice',
}: {
  message: string
  onDismiss: () => void
  /** Nhãn (đã dịch) của nút ✕. */
  dismissLabel: string
  testID?: string
  action?: { label: string; onPress: () => void }
}) {
  const { colors } = useTheme()
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message)
  }, [message])
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingLeft: 12,
        paddingVertical: 2,
        borderRadius: 12,
        backgroundColor: colors.destructiveSoft,
      }}
    >
      <CircleAlert size={16} color={colors.destructiveText} style={{ marginTop: 12 }} aria-hidden />
      <View style={{ flex: 1 }}>
        <Text size={13.5} style={{ paddingVertical: 10, color: colors.destructiveText }}>
          {message}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              alignSelf: 'flex-start',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text weight="semibold" size={13.5} style={{ color: colors.destructiveText }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={onDismiss}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <X size={16} color={colors.destructiveText} aria-hidden />
      </Pressable>
    </View>
  )
}
