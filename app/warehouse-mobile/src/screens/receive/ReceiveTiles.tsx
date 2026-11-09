import { Check, Circle, List } from '@/shared/ui/icons'
import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import type { LineFilter, Progress } from '@/features/receive-checklist'
import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { ROW_PRESS_DELAY_MS, Text } from '@/shared/ui'

const ORDER: LineFilter[] = ['all', 'unchecked', 'match', 'diff']

/** Số của từng ô: "Khớp" = đã kiểm − lệch − không nhận; "Lệch" gồm cả "Không nhận" (số 0). */
function countOf(filter: LineFilter, p: Progress): number {
  switch (filter) {
    case 'all':
      return p.total
    case 'unchecked':
      return p.unchecked
    case 'match':
      return p.checked - p.diff - p.zero
    case 'diff':
      return p.diff + p.zero
  }
}

export type ReceiveTilesProps = {
  progress: Progress
  value: LineFilter
  onChange: (filter: LineFilter) => void
}

/**
 * Bốn ô số liệu 2×2 kiểu Lời nhắc (Reminders): vừa là tiến độ vừa là bộ lọc — chạm ô để lọc danh
 * sách, ô đang chọn có viền xanh dương 2pt bên trong.
 */
function ReceiveTilesImpl({ progress, value, onChange }: ReceiveTilesProps) {
  const { t } = useTranslation('importForms')
  const { colors } = useTheme()
  const glyph = 14
  const icons: Record<LineFilter, { bg: string; icon: ReactNode }> = {
    all: {
      bg: colors.accent,
      icon: <List size={glyph} color="#fff" strokeWidth={3} aria-hidden />,
    },
    unchecked: {
      bg: colors.mutedForeground,
      icon: <Circle size={glyph - 2} color="#fff" strokeWidth={3} aria-hidden />,
    },
    match: {
      bg: colors.success,
      icon: <Check size={glyph} color="#fff" strokeWidth={3} aria-hidden />,
    },
    // Không có icon "!" trơn trong lucide: dùng cùng ký tự "!" với vòng tròn của dòng lệch.
    diff: {
      bg: colors.warning,
      icon: (
        <Text weight="bold" size={15} style={{ color: '#fff', lineHeight: 17 }}>
          !
        </Text>
      ),
    },
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {ORDER.map((f) => {
        const n = countOf(f, progress)
        const label = t(`receive.tiles.${f}`)
        const selected = value === f
        return (
          <Pressable
            key={f}
            accessibilityRole="button"
            accessibilityLabel={t('receive.tiles.a11y', { label, n })}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return
              haptics.selection()
              onChange(f)
            }}
            unstable_pressDelay={ROW_PRESS_DELAY_MS}
            style={({ pressed }) => ({
              // Hai cột: (100% − khoảng 10) / 2.
              flexBasis: '47%',
              flexGrow: 1,
              gap: 6,
              // Viền 2pt luôn có (trong suốt khi chưa chọn) để ô không đổi cỡ khi chọn: đệm 8×10 + viền
              // = 10×12 như mockup.
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 16,
              backgroundColor: pressed ? colors.rowPressed : colors.card,
              borderWidth: 2,
              borderColor: selected ? colors.accent : 'transparent',
            })}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: icons[f].bg,
                }}
              >
                {icons[f].icon}
              </View>
              <Text numeric weight="bold" size={24} numberOfLines={1}>
                {String(n)}
              </Text>
            </View>
            <Text muted weight="semibold" size={13.5} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export const ReceiveTiles = memo(ReceiveTilesImpl)
