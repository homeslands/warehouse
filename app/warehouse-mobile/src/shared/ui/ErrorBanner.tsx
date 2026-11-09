import { CloudOff } from './icons'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { Text } from './Text'

export type ErrorBannerProps = {
  message: string
  /** Nhãn nút thử lại (đã dịch), vd `common:retry`. */
  retryLabel: string
  busy: boolean
  onRetry: () => void
}

/**
 * Dòng báo lỗi nhỏ phía trên nội dung khi làm mới lỗi mà đã có dữ liệu (giữ nguyên dữ liệu cũ).
 * Thử lại: vùng chạm 44, đang gửi thì khoá + vòng quay.
 */
export function ErrorBanner({ message, retryLabel, busy, onRetry }: ErrorBannerProps) {
  const { colors } = useTheme()
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 12,
        borderRadius: 12,
        backgroundColor: colors.destructiveSoft,
      }}
    >
      <CloudOff size={15} color={colors.destructive} aria-hidden />
      <Text size={13} style={{ flex: 1, color: colors.destructive }}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onRetry}
        style={({ pressed }) => ({
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.destructive} />
        ) : (
          <Text weight="semibold" size={13} style={{ color: colors.destructive }}>
            {retryLabel}
          </Text>
        )}
      </Pressable>
    </View>
  )
}
