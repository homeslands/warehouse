import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, View } from 'react-native'

import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { LIST_GUTTER, Text } from '@/shared/ui'

export type ReorderChip = 'all' | 'red' | 'yellow'

/** Chip đang chọn mà số về 0 (chip đã ẩn) → "Tất cả". */
export function effectiveReorderChip(
  value: ReorderChip,
  counts: { red: number; yellow: number },
): ReorderChip {
  if (value === 'red' && counts.red === 0) return 'all'
  if (value === 'yellow' && counts.yellow === 0) return 'all'
  return value
}

export type ReorderLevelChipsProps = {
  /** Đếm trên CẢ KHO (không theo chip đang chọn). */
  counts: { all: number; red: number; yellow: number }
  value: ReorderChip
  onChange: (value: ReorderChip) => void
}

/**
 * Hàng chip lọc mức [Tất cả n] [• Thiếu n] [• Sắp thiếu n] — chép khuôn `StockLevelChips` (không import
 * chéo slice): chip mức có số 0 thì ẩn (chỉ "Tất cả" luôn có). Chip đang chọn mà về 0 → màn tự quay về
 * "Tất cả" (`effectiveReorderChip`).
 */
export function ReorderLevelChips({ counts, value, onChange }: ReorderLevelChipsProps) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  type Entry = { value: ReorderChip; label: string; n: number; dot?: string }
  const entries: Entry[] = [
    { value: 'all', label: t('reorder.chipAll'), n: counts.all },
    { value: 'red', label: t('reorder.chipShort'), n: counts.red, dot: colors.destructive },
    { value: 'yellow', label: t('reorder.chipSoon'), n: counts.yellow, dot: colors.warning },
  ]
  const items = entries.filter((item) => item.value === 'all' || item.n > 0)
  return (
    <ScrollView
      testID="reorder-level-chips"
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -LIST_GUTTER }}
      contentContainerStyle={{ paddingHorizontal: LIST_GUTTER, gap: 8, alignItems: 'center' }}
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <Pressable
            key={item.value}
            testID={`reorder-chip-${item.value}`}
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
    </ScrollView>
  )
}
