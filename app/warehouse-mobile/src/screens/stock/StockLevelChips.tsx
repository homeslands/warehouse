import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, View } from 'react-native'

import type { StockOverview } from '@/entities/inventory'
import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { LIST_GUTTER, Text } from '@/shared/ui'

import type { StockLevelFilter } from './stock-filter.store'

export type StockLevelChipsProps = {
  /** Đếm trên CẢ KHO (không theo tìm kiếm / lọc) — như thanh tổng quan cũ. */
  counts: StockOverview
  level: StockLevelFilter | undefined
  onChange: (level: StockLevelFilter | undefined) => void
}

/**
 * Hàng chip lọc mức tồn đầu danh sách (thay thanh tổng quan, chốt 2026-11-19): [Tất cả n] [• Thiếu n]
 * [• Vượt n]. "Thiếu" = hết hàng + dưới tối thiểu — đúng nghĩa bộ lọc `low` (menu Lọc, lối tắt từ tab Tổng
 * quan); chấm đỏ — gồm cả hết hàng. Chip đang chọn nền `foreground`. Kho không có cảnh báo → chỉ chip
 * "Tất cả" + chữ "Không có cảnh báo". Cùng ghi `useStockFilter.level` với menu Lọc.
 */
export function StockLevelChips({ counts, level, onChange }: StockLevelChipsProps) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  const short = counts.out + counts.low
  const items: { value: StockLevelFilter | undefined; label: string; n: number; dot?: string }[] = [
    { value: undefined, label: t('alertAll'), n: counts.total },
    ...(short > 0
      ? [{ value: 'low' as const, label: t('chipLow'), n: short, dot: colors.destructive }]
      : []),
    ...(counts.high > 0
      ? [{ value: 'high' as const, label: t('chipHigh'), n: counts.high, dot: colors.accent }]
      : []),
  ]
  return (
    <ScrollView
      testID="stock-level-chips"
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -LIST_GUTTER }}
      contentContainerStyle={{ paddingHorizontal: LIST_GUTTER, gap: 8, alignItems: 'center' }}
    >
      {items.map((item) => {
        const selected = item.value === level
        return (
          <Pressable
            key={item.value ?? 'all'}
            testID={`stock-chip-${item.value ?? 'all'}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}, ${item.n}`}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return
              haptics.selection()
              onChange(item.value)
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 32,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: selected ? colors.foreground : colors.fill,
              }}
            >
              {item.dot ? (
                <View
                  style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: item.dot }}
                />
              ) : null}
              <Text
                weight="medium"
                size={14}
                style={{ color: selected ? colors.background : colors.fillForeground }}
              >
                {item.label}
              </Text>
              <Text
                numeric
                size={14}
                style={{ color: selected ? colors.background : colors.mutedForeground }}
              >
                {item.n}
              </Text>
            </View>
          </Pressable>
        )
      })}
      {short === 0 && counts.high === 0 ? (
        <Text muted size={14}>
          {t('overviewNoAlerts')}
        </Text>
      ) : null}
    </ScrollView>
  )
}
