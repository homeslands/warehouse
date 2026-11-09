import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { attachmentName } from '@/shared/lib/attachment'
import { useTheme } from '@/shared/theme/useTheme'
import { FormInfoRow, Text } from '@/shared/ui'

import { useAttachmentField, type AttachmentFieldOptions } from '../model/useAttachmentField'

/**
 * Dòng "Chứng từ" (`FormInfoRow`) của nhóm đầu phiếu, bước 1 form soạn phiếu: giá trị = tên file, trống
 * thì "Thêm"; bấm → bảng chọn (`useAttachmentField`). Đang tải lên: vòng quay + "Đang tải lên…", không
 * bấm được. Lỗi chọn / tải hiện dưới dòng. `disabled` (đang ghi phiếu): không mở.
 */
export function AttachmentField({
  label,
  testID,
  first,
  ...options
}: AttachmentFieldOptions & { label: string; testID?: string; first?: boolean }) {
  const { t } = useTranslation('common')
  const { colors } = useTheme()
  const field = useAttachmentField(options)

  if (field.uploading) {
    return (
      <FormInfoRow kind="custom" first={first} testID={testID} label={label}>
        <View
          accessible
          accessibilityLabel={t('attachment.uploadingA11y', { label })}
          accessibilityState={{ busy: true, disabled: true }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}
        >
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text size={15} muted>
            {t('attachment.uploading')}
          </Text>
        </View>
      </FormInfoRow>
    )
  }
  return (
    <FormInfoRow
      kind="picker"
      first={first}
      testID={testID}
      label={label}
      value={options.value ? attachmentName(options.value) : t('attachment.add')}
      error={field.error}
      disabled={options.disabled}
      onPress={field.open}
    />
  )
}
