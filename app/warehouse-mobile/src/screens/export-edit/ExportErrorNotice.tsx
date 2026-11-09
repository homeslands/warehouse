import { useTranslation } from 'react-i18next'

import { ErrorNotice } from '@/shared/ui'

/** Thông báo mức phiếu của các bước phiếu xuất, ghim ngay trên các nút ở đáy (`ErrorNotice`). */
export function ExportErrorNotice({
  message,
  onDismiss,
  testID = 'export-edit-error',
}: {
  message: string
  onDismiss: () => void
  testID?: string
}) {
  const { t } = useTranslation('exportForms')
  return (
    <ErrorNotice
      testID={testID}
      message={message}
      onDismiss={onDismiss}
      dismissLabel={t('edit.actions.dismiss')}
    />
  )
}
