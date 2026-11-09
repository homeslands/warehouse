import { View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

export type LevelPillProps = {
  level: 'out' | 'low' | 'high'
  /** Chữ trên viên (ngắn ở danh sách, đầy đủ ở chi tiết). */
  label: string
}

/**
 * Viên nhãn mức tồn kiểu tag iOS: capsule, chữ 12 semibold, hết hàng đỏ / dưới min vàng / vượt max
 * xanh dương (cặp `*Soft` + `*Text`). Dùng chung cho dòng danh sách và thẻ số tồn.
 */
export function LevelPill({ level, label }: LevelPillProps) {
  const { colors } = useTheme()
  const { bg, fg } = {
    out: { bg: colors.destructiveSoft, fg: colors.destructiveText },
    low: { bg: colors.warningSoft, fg: colors.warningText },
    high: { bg: colors.infoSoft, fg: colors.infoText },
  }[level]
  return (
    <View
      style={{
        minWidth: 44,
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Text weight="semibold" size={12} numberOfLines={1} style={{ color: fg }}>
        {label}
      </Text>
    </View>
  )
}
