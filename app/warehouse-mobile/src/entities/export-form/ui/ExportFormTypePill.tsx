import { View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

import type { ExportFormType } from '../model/types'

export type ExportFormTypePillProps = { type: ExportFormType; testID?: string }

/**
 * Viên nhãn lý do xuất (Sản xuất / Bán / Chuyển kho / Huỷ / Khác): nền thẻ đặc + viền 1pt như viên
 * trạng thái (không chìm vào nền nhóm), chữ `foreground`.
 */
export function ExportFormTypePill({ type, testID = 'export-form-type' }: ExportFormTypePillProps) {
  const { t } = useTranslation('exportForms')
  const { colors } = useTheme()
  return (
    <View
      testID={testID}
      style={{
        flexShrink: 0,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text weight="semibold" size={11.5} numberOfLines={1} style={{ color: colors.foreground }}>
        {t(`type.${type}`)}
      </Text>
    </View>
  )
}
