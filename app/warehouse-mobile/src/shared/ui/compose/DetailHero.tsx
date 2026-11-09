import type { ReactNode } from 'react'
import { View } from 'react-native'

import { formatMoney, type FormatLocale } from '../../lib/format'
import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'

export type DetailHeroProps = {
  /** Hàng viên trạng thái / loại. */
  pills: ReactNode
  title: string
  titleMuted?: boolean
  /** Dòng phụ dưới tiêu đề (vd "HĐ … · ngày"). */
  meta?: ReactNode
  /** Đã dịch, vd "Tổng cộng". */
  totalLabel: string
  total: number
  locale: FormatLocale
  /** Vd "3 dòng vật tư". */
  count: string
  /** Tổng: `${testID}-total`; dòng phụ: `${testID}-meta`. */
  testID?: string
}

/**
 * Đầu màn xem phiếu (chữ trên nền nhóm, không thẻ): viên, tiêu đề đậm 20 (tối đa 2 dòng), dòng phụ,
 * nhãn "Tổng cộng", tổng tiền đậm 28, số dòng mờ.
 */
export function DetailHero({
  pills,
  title,
  titleMuted,
  meta,
  totalLabel,
  total,
  locale,
  count,
  testID,
}: DetailHeroProps) {
  const { colors } = useTheme()
  return (
    <View testID={testID} style={{ paddingHorizontal: 4, paddingTop: 2 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>{pills}</View>
      <Text
        accessibilityRole="header"
        weight="bold"
        size={20}
        numberOfLines={2}
        muted={titleMuted}
        style={{ marginTop: 8, lineHeight: 25 }}
      >
        {title}
      </Text>
      {meta ? (
        <View testID={testID ? `${testID}-meta` : undefined} style={{ marginTop: 2 }}>
          {meta}
        </View>
      ) : null}
      <Text size={13} style={{ marginTop: 6, color: colors.fieldLabel }}>
        {totalLabel}
      </Text>
      <Text
        testID={testID ? `${testID}-total` : undefined}
        numeric
        weight="bold"
        size={28}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ marginTop: 2, letterSpacing: -0.3 }}
      >
        {formatMoney(total, locale)}
      </Text>
      <Text numeric muted size={13} style={{ marginTop: 2 }}>
        {count}
      </Text>
    </View>
  )
}
