import { View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

import type { ImportFormStatus } from '../model/types'

export type ImportFormStatusPillProps = {
  status: ImportFormStatus
  /** Chữ trên nhãn (thường `importForms:status.*`; phiếu mới chưa lưu: "Chưa lưu", màu như Nháp). */
  label: string
  testID?: string
}

/**
 * Viên nhãn trạng thái phiếu nhập: Nháp vàng (`warning*`), Đã xác nhận xanh (`success*`), Đã huỷ xám
 * (`fill`). Dùng chung cho màn xem phiếu và màn kiểm hàng.
 */
export function ImportFormStatusPill({
  status,
  label,
  testID = 'import-form-status',
}: ImportFormStatusPillProps) {
  const { colors } = useTheme()
  const { bg, fg } = {
    DRAFT: { bg: colors.warningSoft, fg: colors.warningText },
    CONFIRMED: { bg: colors.successSoft, fg: colors.successText },
    CANCELLED: { bg: colors.fill, fg: colors.mutedForeground },
  }[status]
  return (
    <View
      testID={testID}
      style={{
        flexShrink: 0,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Text weight="semibold" size={11.5} numberOfLines={1} style={{ color: fg }}>
        {label}
      </Text>
    </View>
  )
}
