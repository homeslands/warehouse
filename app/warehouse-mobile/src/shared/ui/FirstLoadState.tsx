import { CloudOff } from './icons'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

export type FirstLoadStateProps = {
  /** Tải lần đầu lỗi → màn lỗi + "Thử lại"; ngược lại → vòng quay. */
  failed: boolean
  errorTitle: string
  errorMessage: string
  loadingLabel: string
  /** Đang tải lại (nút "Thử lại" quay). */
  fetching: boolean
  onRetry: () => void
}

/** Thân màn khi dữ liệu lần đầu chưa sẵn sàng (bước wizard, màn xem phiếu): lỗi + "Thử lại" hoặc vòng quay. */
export function FirstLoadState({
  failed,
  errorTitle,
  errorMessage,
  loadingLabel,
  fetching,
  onRetry,
}: FirstLoadStateProps) {
  const { t } = useTranslation('common')
  const { colors } = useTheme()
  if (failed) {
    return (
      <View style={{ paddingTop: 48, gap: 18 }}>
        <EmptyState icon={CloudOff} title={errorTitle} description={errorMessage} />
        <Button
          variant="outline"
          loading={fetching}
          style={{ alignSelf: 'center' }}
          onPress={onRetry}
        >
          {t('retry')}
        </Button>
      </View>
    )
  }
  return (
    <View style={{ paddingTop: 64 }}>
      <ActivityIndicator accessibilityLabel={loadingLabel} color={colors.mutedForeground} />
    </View>
  )
}
