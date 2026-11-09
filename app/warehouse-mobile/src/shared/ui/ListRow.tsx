import { ChevronRight, type LucideIcon } from './icons'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { IconTile, type IconTileTone } from './IconTile'
import { Text } from './Text'
import { ROW_PRESS_DELAY_MS } from './press'

export type ListRowProps = {
  label: string
  icon?: LucideIcon
  /** Kiểu ô icon. Bỏ qua khi `destructive` (luôn đỏ nhạt). */
  tone?: IconTileTone
  /** Giá trị xám bên phải (vd "Tiếng Việt", "Đổi"). */
  value?: string
  /** Dòng phụ dưới nhãn (vd mã kho + chip vai trò). */
  subtitle?: ReactNode
  chevron?: boolean
  /** Phần tử cuối dòng (vd dấu tích của kho đang chọn). */
  trailing?: ReactNode
  /** Thao tác nguy hiểm: nhãn đỏ (ô icon đỏ nhạt nếu có icon). */
  destructive?: boolean
  /** Nhãn căn giữa, kiểu nút "Đăng xuất" trong Cài đặt iOS (dùng không kèm icon). */
  centered?: boolean
  /** Đang chạy: vòng quay nhỏ cạnh nhãn, không bấm được. */
  busy?: boolean
  onPress?: () => void
  selected?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  /** Cỡ iOS 26/27: dòng cao 50, ô icon 30, lề 16 (đường kẻ của nhóm lùi 58). */
  large?: boolean
}

/** Một dòng trong `ListGroup`: ô icon, nhãn một dòng, giá trị tuỳ chọn, mũi tên tuỳ chọn. */
export function ListRow({
  label,
  icon,
  tone = 'solid',
  value,
  subtitle,
  chevron,
  trailing,
  destructive,
  centered,
  busy,
  onPress,
  selected,
  accessibilityLabel,
  accessibilityHint,
  large,
}: ListRowProps) {
  const { colors } = useTheme()
  const labelColor = destructive ? colors.destructive : colors.foreground
  const content = (
    <>
      {icon ? (
        <IconTile icon={icon} tone={destructive ? 'destructive' : tone} size={large ? 30 : 28} />
      ) : null}
      <View style={centered ? null : { flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          weight={destructive ? 'medium' : subtitle ? 'semibold' : 'regular'}
          style={{ color: labelColor }}
        >
          {label}
        </Text>
        {subtitle}
      </View>
      {value ? (
        <Text muted size={14} numberOfLines={1} style={{ flexShrink: 1, maxWidth: '60%' }}>
          {value}
        </Text>
      ) : null}
      {busy ? <ActivityIndicator size="small" color={labelColor} /> : null}
      {trailing}
      {chevron ? <ChevronRight size={16} color={colors.chevron} aria-hidden /> : null}
    </>
  )

  const rowStyle = {
    minHeight: large ? 50 : 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: centered ? 'center' : 'flex-start',
    gap: centered ? 8 : large ? 12 : 11,
    paddingHorizontal: large ? 16 : 14,
    paddingVertical: subtitle ? 10 : 8,
  } as const
  const a11yLabel = accessibilityLabel ?? (value ? `${label}, ${value}` : label)

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={a11yLabel} style={rowStyle}>
        {content}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        ...(selected === undefined ? null : { selected }),
        ...(busy ? { busy: true, disabled: true } : null),
      }}
      disabled={busy}
      onPress={onPress}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      style={({ pressed }) => [rowStyle, pressed ? { backgroundColor: colors.rowPressed } : null]}
    >
      {content}
    </Pressable>
  )
}
