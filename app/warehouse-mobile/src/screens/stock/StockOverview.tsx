import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { StockOverview as Counts } from '@/entities/inventory'
import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

/** Đoạn có số > 0 luôn thấy được (ít nhất 3pt) dù tỉ lệ rất nhỏ. */
const MIN_SEGMENT = 3

/**
 * Thanh tổng quan đầu danh sách (hướng C): thanh màu tỉ lệ hết / dưới min / vượt max / bình thường
 * + dòng "128 vật tư · 2 hết · 6 dưới · 3 vượt". Luôn đếm trên CẢ KHO (không theo tìm kiếm / lọc),
 * chỉ để xem — lọc mức tồn nằm ở menu Lọc.
 */
export function StockOverview({ counts }: { counts: Counts }) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  const { total, out, low, high, ok } = counts
  const alerts = [
    out > 0
      ? { n: out, text: t('overviewOut', { count: out }), color: colors.destructiveText }
      : null,
    low > 0 ? { n: low, text: t('overviewLow', { count: low }), color: colors.warningText } : null,
    high > 0 ? { n: high, text: t('overviewHigh', { count: high }), color: colors.infoText } : null,
  ].filter((a) => a !== null)
  const segments = [
    { n: out, color: colors.destructive },
    { n: low, color: colors.warning },
    { n: high, color: colors.info },
    { n: ok, color: colors.success },
  ].filter((s) => s.n > 0)

  return (
    <View
      testID="stock-overview"
      accessible
      accessibilityLabel={t('overviewLabel', { total, out, low, high })}
      style={{ gap: 9, paddingHorizontal: 4, paddingBottom: 10 }}
    >
      <View
        aria-hidden
        style={{
          flexDirection: 'row',
          gap: 2,
          height: 6,
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: colors.separator,
        }}
      >
        {segments.map((s) => (
          <View
            key={s.color}
            style={{ flexGrow: s.n, flexBasis: 0, minWidth: MIN_SEGMENT, backgroundColor: s.color }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text weight="semibold" size={12.5} style={{ color: colors.fieldLabel }}>
          {t('itemCount', { count: total })}
        </Text>
        {alerts.length > 0 ? (
          <Text size={12.5} numberOfLines={1} style={{ flexShrink: 1, color: colors.fieldLabel }}>
            {alerts.flatMap((a, i) => [
              i > 0 ? ' · ' : null,
              <Text key={a.text} size={12.5} weight="semibold" style={{ color: a.color }}>
                {a.text}
              </Text>,
            ])}
          </Text>
        ) : (
          <Text muted size={12.5}>
            {t('overviewNoAlerts')}
          </Text>
        )}
      </View>
    </View>
  )
}
