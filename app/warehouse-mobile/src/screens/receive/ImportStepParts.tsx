import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { importFormErrorMessage } from '@/entities/import-form'
import { useTheme } from '@/shared/theme/useTheme'
import { FirstLoadState } from '@/shared/ui'

import { ReceiveErrorNotice } from './ReceiveErrorNotice'
import type { ImportStepNotices as Notices } from './useImportStepNotices'
import type { ImportWizardDraft } from './useImportWizardDraft'

/**
 * Thông báo mức phiếu ở đáy các bước phiếu nhập (từ `useImportStepNotices`): của store dùng chung
 * (testID `import-form-notice`) TRƯỚC, rồi của màn (`import-screen-notice`); đóng một cái là bỏ hết.
 */
export function ImportStepNotices({ notices }: { notices: Notices }) {
  const { colors } = useTheme()
  const { formNotice, screenNotice, dismiss } = notices
  const items = [
    formNotice ? { testID: 'import-form-notice', message: formNotice } : null,
    screenNotice ? { testID: 'import-screen-notice', message: screenNotice } : null,
  ].filter((n) => n !== null)
  return (
    <>
      {items.map((n) => (
        // Nền thẻ đặc dưới nền đỏ nhạt để chữ không lẫn với nội dung bên dưới.
        <View key={n.testID} style={{ borderRadius: 12, backgroundColor: colors.card }}>
          <ReceiveErrorNotice testID={n.testID} message={n.message} onDismiss={dismiss} />
        </View>
      ))}
    </>
  )
}

/**
 * Thân của một bước phiếu nhập khi bản nháp CHƯA sẵn sàng: phiếu đã có tải lần đầu lỗi → màn lỗi +
 * "Thử lại"; còn lại → vòng quay. (Bản nháp sẵn sàng thì màn tự vẽ nội dung của bước.)
 */
export function ImportStepLoadState({
  wizard,
  onRetry,
}: {
  wizard: Pick<ImportWizardDraft, 'isNew' | 'failedFirstLoad' | 'loadError' | 'query'>
  onRetry: () => void
}) {
  const { t } = useTranslation(['importForms', 'common'])
  return (
    <FirstLoadState
      failed={!wizard.isNew && wizard.failedFirstLoad}
      errorTitle={t('importForms:receive.loadError')}
      errorMessage={importFormErrorMessage(wizard.loadError, t)}
      loadingLabel={t('importForms:receive.loading')}
      fetching={wizard.query.isFetching}
      onRetry={onRetry}
    />
  )
}
