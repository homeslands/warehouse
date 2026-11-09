import { ShieldOff } from '@/shared/ui/icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { refreshCurrentUser } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { LogoutButton } from '@/features/logout'
import { errorMessage } from '@/shared/api/error-message'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, Screen, Text } from '@/shared/ui'

/**
 * Đăng nhập được nhưng không làm được gì: chưa được gán kho (`noWarehouse`) hoặc không có tab
 * nghiệp vụ nào (`noAccess`). Thử lại = nạp lại `/auth/me` (+ resolve lại kho khi chưa có kho — ADMIN+
 * tải lại `GET /warehouses`): quyền/kho vừa được cấp thì SessionGate tự chuyển màn. Đăng xuất để đổi tài khoản.
 */
export function NoAccessScreen() {
  const { t } = useTranslation(['auth', 'account', 'common'])
  const { colors } = useTheme()
  const noWarehouse = useWarehouseStore((s) => s.resolution === 'none')
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const retry = async () => {
    setRetrying(true)
    setRetryError(null)
    try {
      await refreshCurrentUser()
      // Chưa có kho: resolve lại. Cần cho ADMIN+ — danh sách là `GET /warehouses`, hồ sơ nạp lại không
      // đổi nên session-wiring không tự tải lại. Vai trò khác: hồ sơ đổi kho thì wiring đã resolve,
      // chạy thêm lần nữa cũng cùng kết quả.
      if (useWarehouseStore.getState().resolution === 'none') {
        await useWarehouseStore.getState().retry()
      }
    } catch (e) {
      setRetryError(errorMessage(e, t))
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Screen style={{ justifyContent: 'center', padding: 24, gap: 16 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <ShieldOff size={40} color={colors.mutedForeground} />
        <Text
          weight="semibold"
          size={20}
          accessibilityRole="header"
          style={{ textAlign: 'center' }}
        >
          {noWarehouse ? t('auth:noWarehouse') : t('auth:noAccess')}
        </Text>
        <Text muted style={{ textAlign: 'center' }}>
          {t('auth:noAccessHint')}
        </Text>
      </View>
      {retryError ? (
        <Text
          size={14}
          accessibilityRole="alert"
          style={{ color: colors.destructive, textAlign: 'center' }}
        >
          {retryError}
        </Text>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button loading={retrying} onPress={() => void retry()}>
          {t('common:retry')}
        </Button>
        <LogoutButton variant="ghost" />
      </View>
    </Screen>
  )
}
