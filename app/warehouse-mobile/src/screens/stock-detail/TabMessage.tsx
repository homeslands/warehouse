import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'
import { Button, Text } from '@/shared/ui'

export type TabMessageProps = {
  text?: string
  loading?: boolean
  loadingLabel?: string
  onRetry?: () => void
  retrying?: boolean
}

/** Thẻ thông báo trong tab (lỗi / đang tải / rỗng): chữ hoặc vòng quay, kèm "Thử lại" khi có `onRetry`. */
export function TabMessage({ text, loading, loadingLabel, onRetry, retrying }: TabMessageProps) {
  const { t } = useTranslation('common')
  const { colors, radius } = useTheme()
  return (
    <View
      style={{
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 20,
        borderRadius: radius.groupLarge,
        backgroundColor: colors.card,
      }}
    >
      {loading ? (
        <ActivityIndicator accessibilityLabel={loadingLabel} color={colors.mutedForeground} />
      ) : null}
      {text ? (
        <Text muted size={14} style={{ textAlign: 'center' }}>
          {text}
        </Text>
      ) : null}
      {onRetry ? (
        <Button variant="outline" loading={retrying} onPress={onRetry}>
          {t('retry')}
        </Button>
      ) : null}
    </View>
  )
}
