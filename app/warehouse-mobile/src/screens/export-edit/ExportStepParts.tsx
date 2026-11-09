import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { exportFormErrorMessage } from '@/entities/export-form'
import { useTheme } from '@/shared/theme/useTheme'
import { FirstLoadState } from '@/shared/ui'

import { ExportErrorNotice } from './ExportErrorNotice'
import type { ExportStepNotices as Notices } from './useExportStepNotices'
import type { ExportWizardDraft } from './useExportWizardDraft'

/**
 * Thông báo mức phiếu ở đáy các bước phiếu xuất (từ `useExportStepNotices`): của store dùng chung
 * (testID `export-form-notice`) TRƯỚC, rồi của màn (`export-screen-notice`); đóng một cái là bỏ hết.
 */
export function ExportStepNotices({ notices }: { notices: Notices }) {
  const { colors } = useTheme()
  const { formNotice, screenNotice, dismiss } = notices
  const items = [
    formNotice ? { testID: 'export-form-notice', message: formNotice } : null,
    screenNotice ? { testID: 'export-screen-notice', message: screenNotice } : null,
  ].filter((n) => n !== null)
  return (
    <>
      {items.map((n) => (
        // Nền thẻ đặc dưới nền đỏ nhạt để chữ không lẫn với nội dung bên dưới.
        <View key={n.testID} style={{ borderRadius: 12, backgroundColor: colors.card }}>
          <ExportErrorNotice testID={n.testID} message={n.message} onDismiss={dismiss} />
        </View>
      ))}
    </>
  )
}

/**
 * Thân của một bước phiếu xuất khi bản nháp CHƯA sẵn sàng: phiếu đã có tải lần đầu lỗi → màn lỗi +
 * "Thử lại"; còn lại → vòng quay. (Bản nháp sẵn sàng thì màn tự vẽ nội dung của bước.)
 */
export function ExportStepLoadState({
  wizard,
  onRetry,
}: {
  wizard: Pick<ExportWizardDraft, 'isNew' | 'failedFirstLoad' | 'loadError' | 'query'>
  onRetry: () => void
}) {
  const { t } = useTranslation(['exportForms', 'common'])
  return (
    <FirstLoadState
      failed={!wizard.isNew && wizard.failedFirstLoad}
      errorTitle={t('exportForms:edit.loadError')}
      errorMessage={exportFormErrorMessage(wizard.loadError, t)}
      loadingLabel={t('exportForms:edit.loading')}
      fetching={wizard.query.isFetching}
      onRetry={onRetry}
    />
  )
}
