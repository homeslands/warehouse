import { X } from '@/shared/ui/icons'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

import { useActiveFilterLabels, useListViewer } from '../labels'
import type { ChipFilterStore } from '../store'

const CLEAR_SIZE = 28
/** 28 + 8 + 8 = vùng chạm 44×44 mà dòng vẫn gọn. */
const CLEAR_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }
/** Phần chữ cao 28 + 8 + 8 = vùng chạm 44 theo chiều cao (chiều ngang đã chiếm hết dòng). */
const TEXT_SLOP = { top: 8, bottom: 8 }

/**
 * Một dòng tóm tắt bộ lọc đang có hiệu lực dưới ô trạng thái: "7 ngày qua · Phiếu của tôi · Nguyễn
 * Văn A" (chữ mờ 13, một dòng, cắt đuôi). Nhãn chip đọc từ `store`; `extraLabels` = nhãn bộ lọc riêng
 * của tab (nối sau). Không có gì đang lọc → không hiện. Chạm dòng → `onOpen` (mở sheet Lọc); ✕ cuối
 * dòng → `clearChips()` + `onClearExtra` (bộ lọc riêng của tab).
 */
export function FilterSummary({
  store,
  extraLabels = [],
  onClearExtra,
  onOpen,
}: {
  store: ChipFilterStore
  extraLabels?: string[]
  /** Xoá bộ lọc riêng của tab (gọi cùng `clearChips()` khi bấm ✕). */
  onClearExtra?: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation('importForms')
  const { colors } = useTheme()
  const viewer = useListViewer()
  const time = store((s) => s.time)
  const requester = store((s) => s.requester)
  const approver = store((s) => s.approver)
  const labels = useActiveFilterLabels(viewer, { time, requester, approver })
  const values = [labels.time, labels.requester, labels.approver, ...extraLabels].filter(
    (v): v is string => !!v,
  )
  if (values.length === 0) return null
  const text = values.join(' · ')
  return (
    <View
      testID="filter-summary"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('list.filters.summaryA11y', { value: text })}
        onPress={onOpen}
        hitSlop={TEXT_SLOP}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 28,
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text muted size={13} numberOfLines={1}>
          {text}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('list.filters.clear')}
        onPress={() => {
          store.getState().clearChips()
          onClearExtra?.()
        }}
        hitSlop={CLEAR_SLOP}
        style={({ pressed }) => ({
          width: CLEAR_SIZE,
          height: CLEAR_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.5 : 1,
        })}
      >
        <X size={16} color={colors.mutedForeground} aria-hidden />
      </Pressable>
    </View>
  )
}
