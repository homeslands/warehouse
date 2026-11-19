import { ChevronRight, type LucideIcon } from './icons'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { useTheme } from '../theme/useTheme'
import { IconTile, type IconTileTone } from './IconTile'
import { useListVariant } from './cardVariant'
import { ICON_CARD_INSET } from './ListGroup'
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
  /**
   * Dòng HÀNH ĐỘNG kiểu iOS ("+ Thêm quy đổi"): nhãn + icon màu `accent`, icon trơn 20 KHÔNG vòng / ô —
   * đứng thẳng cột chữ của các dòng chữ trong thẻ (không lệch như vòng 40 trong dòng 56).
   */
  action?: boolean
  /** Nhãn căn giữa, kiểu nút "Đăng xuất" trong Cài đặt iOS (dùng không kèm icon). */
  centered?: boolean
  /** Đang chạy: vòng quay nhỏ cạnh nhãn, không bấm được. */
  busy?: boolean
  /** Khoá dòng: mờ, `accessibilityState.disabled`, không bao giờ gọi `onPress`. */
  disabled?: boolean
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
  icon: Icon,
  tone = 'solid',
  value,
  subtitle,
  chevron,
  trailing,
  destructive,
  action,
  centered,
  busy,
  disabled,
  onPress,
  selected,
  accessibilityLabel,
  accessibilityHint,
  large,
}: ListRowProps) {
  const { colors } = useTheme()
  const variant = useListVariant()
  const isCard = variant === 'card' || variant === 'iconCard'
  // `iconCard` + có icon: vòng 40 cách mép trái đúng bằng cách mép trên / dưới (12) — không lệch vào trong.
  const balanced = variant === 'iconCard' && !!Icon
  const labelColor = destructive ? colors.destructive : action ? colors.accent : colors.foreground
  const content = (
    <>
      {Icon && action ? (
        <Icon testID="action-icon" size={20} strokeWidth={2.25} color={labelColor} aria-hidden />
      ) : Icon && isCard ? (
        <View
          testID="card-icon-circle"
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 40 / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: destructive ? colors.destructiveSoft : colors.fill,
          }}
        >
          <Icon
            size={20}
            strokeWidth={2.25}
            color={destructive ? colors.destructive : colors.foreground}
          />
        </View>
      ) : Icon ? (
        <IconTile icon={Icon} tone={destructive ? 'destructive' : tone} size={large ? 30 : 28} />
      ) : null}
      <View style={centered ? null : { flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          size={isCard ? 17 : undefined}
          weight={destructive || action ? 'medium' : subtitle ? 'semibold' : 'regular'}
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
    minHeight: balanced ? 40 + ICON_CARD_INSET * 2 : isCard ? 56 : large ? 50 : 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: centered ? 'center' : 'flex-start',
    gap: centered ? 8 : isCard || large ? 12 : 11,
    paddingHorizontal: isCard ? 20 : large ? 16 : 14,
    ...(balanced ? { paddingLeft: ICON_CARD_INSET, paddingRight: 16 } : null),
    paddingVertical: balanced ? ICON_CARD_INSET : subtitle ? 10 : 8,
  } as const
  const a11yLabel = accessibilityLabel ?? (value ? `${label}, ${value}` : label)

  if (disabled) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: true }}
        disabled
        style={[rowStyle, { opacity: 0.4 }]}
      >
        {content}
      </Pressable>
    )
  }
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
