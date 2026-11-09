import { WifiOff } from '@/shared/ui/icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { bootstrapSession } from '@/entities/session'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, Screen, Text } from '@/shared/ui'

/**
 * Có token nhưng chưa xác minh được (lỗi tạm thời). Trạng thái `offline` không tự hồi phục: chỉ
 * nút Thử lại chạy lại `bootstrapSession()`. Token được giữ nguyên.
 */
export function OfflineScreen() {
  const { t } = useTranslation('common')
  const { colors } = useTheme()
  const [retrying, setRetrying] = useState(false)

  const retry = async () => {
    setRetrying(true)
    try {
      await bootstrapSession()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Screen style={{ justifyContent: 'center', padding: 24, gap: 16 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <WifiOff size={40} color={colors.mutedForeground} />
        <Text
          weight="semibold"
          size={20}
          accessibilityRole="header"
          style={{ textAlign: 'center' }}
        >
          {t('offline')}
        </Text>
        <Text muted style={{ textAlign: 'center' }}>
          {t('offlineDescription')}
        </Text>
      </View>
      <Button loading={retrying} onPress={() => void retry()}>
        {t('retry')}
      </Button>
    </Screen>
  )
}
