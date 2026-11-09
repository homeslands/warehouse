import { View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

import type { ExportFormStatus } from '../model/types'

export type ExportFormStatusPillProps = {
  status: ExportFormStatus
  /** Thay chữ, giữ màu theo `status` (vd phiếu mới chưa có trên server: "Chưa lưu" màu Nháp). */
  label?: string
  testID?: string
}

/**
 * Viên nhãn trạng thái phiếu xuất. Nền thẻ đặc (`card`) + viền 1pt (`border`) — cùng kiểu viên chọn
 * thời gian — để không chìm vào nền nhóm; nghĩa trạng thái nằm ở chấm màu + chữ màu: Nháp
 * `warningText`, Chờ duyệt `accentText`, Đã xuất `successText`, Đã huỷ `mutedForeground`.
 */
export function ExportFormStatusPill({
  status,
  label,
  testID = 'export-form-status',
}: ExportFormStatusPillProps) {
  const { t } = useTranslation('exportForms')
  const { colors } = useTheme()
  const color = {
    DRAFT: colors.warningText,
    PENDING: colors.accentText,
    CONFIRMED: colors.successText,
    CANCELLED: colors.mutedForeground,
  }[status]
  return (
    <View
      testID={testID}
      style={{
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        testID={`${testID}-dot`}
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }}
      />
      <Text weight="semibold" size={11.5} numberOfLines={1} style={{ color }}>
        {label ?? t(`status.${status}`)}
      </Text>
    </View>
  )
}
