import { ListFilter } from '@/shared/ui/icons'
import type { NativeStackHeaderItemButton } from 'expo-router'
import { Pressable } from 'react-native'

import { useTheme } from '@/shared/theme/useTheme'

type FilterButtonArgs = {
  /** Có bộ lọc thời gian / người đang có hiệu lực (`hasChipFilters`). */
  active: boolean
  label: string
  activeLabel: string
  onPress: () => void
}

/**
 * iOS: nút "Lọc" bên phải thanh của tab Nhập / Xuất — mục GỐC `type: 'button'` (KHÔNG UIMenu: danh sách bên
 * dưới có dòng bấm được, xem lỗi chạm lọt ở CLAUDE.md), mở sheet Lọc của tab. Đang lọc: icon đặc.
 * Khai qua `tabHeaderRight({ ios: [...] })` để thứ tự là [Lọc, kho].
 */
export function filterHeaderItem({
  active,
  label,
  activeLabel,
  onPress,
}: FilterButtonArgs): NativeStackHeaderItemButton {
  return {
    type: 'button',
    label,
    accessibilityLabel: active ? activeLabel : label,
    icon: {
      type: 'sfSymbol',
      name: active ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease.circle',
    },
    onPress,
  }
}

/** Android: nút "Lọc" phẳng 44pt trên header (cạnh nút kho); đang lọc → icon màu accent. */
export function AndroidFilterButton({ active, label, activeLabel, onPress }: FilterButtonArgs) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? activeLabel : label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <ListFilter
        size={22}
        strokeWidth={active ? 2.6 : 2}
        color={active ? colors.accent : colors.foreground}
        aria-hidden
      />
    </Pressable>
  )
}
