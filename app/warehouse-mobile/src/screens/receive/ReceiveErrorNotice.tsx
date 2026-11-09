import { useTranslation } from 'react-i18next'

import { ErrorNotice } from '@/shared/ui'

/**
 * Thông báo lỗi mức phiếu của Lưu / Xác nhận, ghim ngay trên thanh đáy (xem `ErrorNotice` của shared/ui).
 */
export function ReceiveErrorNotice({
  message,
  onDismiss,
  action,
  testID = 'receive-error',
}: {
  message: string
  onDismiss: () => void
  action?: { label: string; onPress: () => void }
  testID?: string
}) {
  const { t } = useTranslation('importForms')
  return (
    <ErrorNotice
      testID={testID}
      message={message}
      onDismiss={onDismiss}
      dismissLabel={t('receive.actions.dismiss')}
      action={action}
    />
  )
}
