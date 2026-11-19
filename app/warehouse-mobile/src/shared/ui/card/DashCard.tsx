import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'

import { haptics } from '../../lib/haptics'
import { radius } from '../../theme/tokens'
import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'
import { ChevronRight, type LucideIcon } from '../icons'
import { ROW_PRESS_DELAY_MS } from '../press'

export type CardVariant = 'default' | 'alert'

/**
 * Khung card của Tổng quan (kiểu app tham khảo): bo 24, lề trong 20 / 18, nền `card`. `onPress` → cả
 * card là MỘT nút; không có thì là khung tĩnh (có thể chứa `CardRow` / `PillButton` chạm được riêng). Có
 * `accessibilityLabel` mà không `onPress` → card là một phần tử a11y (chỉ dùng khi không chứa nút con).
 */
export function DashCard({
  children,
  variant = 'default',
  testID,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: {
  children: ReactNode
  variant?: CardVariant
  testID?: string
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
}) {
  const { colors } = useTheme()
  const box: ViewStyle = {
    borderRadius: radius.card,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 12,
    minHeight: 44,
  }
  if (!onPress)
    return (
      <View
        testID={testID}
        accessible={accessibilityLabel !== undefined}
        accessibilityLabel={accessibilityLabel}
        style={[box, { backgroundColor: colors.card }, style]}
      >
        {children}
      </View>
    )
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        haptics.selection()
        onPress()
      }}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      style={({ pressed }) => [
        box,
        { backgroundColor: pressed ? colors.rowPressed : colors.card },
        style,
      ]}
    >
      {children}
    </Pressable>
  )
}

/** "›" muted cho `CardHeader.trailing` của card chạm được. */
export function CardChevron() {
  const { colors } = useTheme()
  return <ChevronRight size={20} color={colors.chevron} aria-hidden />
}

/**
 * Đầu card: vòng tròn trung tính 40pt (compact 32) chứa icon đơn sắc + nhãn xám; biến thể `alert` = vòng
 * `destructiveSoft` + icon `destructive`. `trailing` ở bên phải (chữ kỳ muted hoặc `CardChevron`).
 */
export function CardHeader({
  icon: Icon,
  label,
  trailing,
  variant = 'default',
  compact,
  heading,
  iconBackground,
  iconColor,
}: {
  icon: LucideIcon
  label: string
  /** Tô vòng icon theo trạng thái (màn chi tiết phiếu). Mặc định: `fill` / `foreground` (hoặc `alert`). */
  iconBackground?: string
  iconColor?: string
  trailing?: ReactNode
  variant?: CardVariant
  compact?: boolean
  /** Nhãn là tiêu đề mục cho VoiceOver / TalkBack (điều hướng theo tiêu đề). */
  heading?: boolean
}) {
  const { colors } = useTheme()
  const circle = compact ? 32 : 40
  const alert = variant === 'alert'
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: circle }}>
      <View
        aria-hidden
        style={{
          width: circle,
          height: circle,
          borderRadius: circle / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: iconBackground ?? (alert ? colors.destructiveSoft : colors.fill),
        }}
      >
        <Icon
          size={compact ? 16 : 20}
          strokeWidth={2.25}
          color={iconColor ?? (alert ? colors.destructive : colors.foreground)}
        />
      </View>
      <Text
        weight="medium"
        size={compact ? 15 : 17}
        numberOfLines={2}
        accessibilityRole={heading ? 'header' : undefined}
        style={{ flex: 1, color: colors.mutedForeground }}
      >
        {label}
      </Text>
      {typeof trailing === 'string' ? (
        <Text muted size={15} numberOfLines={1} style={{ flexShrink: 1 }}>
          {trailing}
        </Text>
      ) : (
        trailing
      )}
    </View>
  )
}

/**
 * Hàng "icon + chữ + ›" (≥ 44pt). `label` có thể chứa `Text` lồng (số đậm + chữ). `value` (số tiền…)
 * thay "›"; `subtitle` dòng phụ muted. Không `onPress` → hàng tĩnh, không chevron.
 */
export function CardRow({
  icon: Icon,
  iconColor,
  label,
  subtitle,
  value,
  trailing,
  onPress,
  muted,
  testID,
  accessibilityLabel,
  accessibilityHint,
  valueCode,
  valueNumeric,
  valueLines,
}: {
  icon?: LucideIcon
  iconColor?: string
  label: ReactNode
  subtitle?: ReactNode
  value?: string
  /** Giá trị là mã (mã phiếu, PO, HĐ): font mã. */
  valueCode?: boolean
  /** Ép font số cho giá trị; bỏ trống = giữ mặc định (numeric khi không phải mã). */
  valueNumeric?: boolean
  /** Giá trị căn phải, tối đa n dòng, rộng tối đa 65% (dòng thông tin ở màn chi tiết). Mặc định: một dòng. */
  valueLines?: number
  /** Phần tử tuỳ ý ở cuối hàng (viên đếm ngược…), thay `value` / "›". */
  trailing?: ReactNode
  onPress?: () => void
  muted?: boolean
  testID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
}) {
  const { colors } = useTheme()
  const textColor = muted ? colors.mutedForeground : colors.foreground
  const body = (
    <>
      {Icon ? (
        <Icon
          size={20}
          strokeWidth={2.25}
          color={muted ? colors.mutedForeground : (iconColor ?? colors.foreground)}
          aria-hidden
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text size={17} numberOfLines={2} style={{ color: textColor }}>
          {label}
        </Text>
        {subtitle ? (
          <Text muted size={13} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        trailing
      ) : value ? (
        <Text
          numeric={valueNumeric ?? !valueCode}
          code={valueCode}
          weight="semibold"
          size={15}
          numberOfLines={valueLines ?? 1}
          style={
            valueLines !== undefined
              ? { color: textColor, maxWidth: '65%', flexShrink: 1, textAlign: 'right' }
              : { color: textColor }
          }
        >
          {value}
        </Text>
      ) : onPress ? (
        <ChevronRight size={20} color={colors.chevron} aria-hidden />
      ) : null}
    </>
  )
  const base: ViewStyle = {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  }
  if (!onPress)
    return (
      <View
        testID={testID}
        accessible={accessibilityLabel !== undefined}
        accessibilityLabel={accessibilityLabel}
        style={base}
      >
        {body}
      </View>
    )
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      onPress={() => {
        haptics.selection()
        onPress()
      }}
      style={({ pressed }) => [
        base,
        {
          marginHorizontal: -8,
          paddingHorizontal: 8,
          borderRadius: 12,
          borderCurve: 'continuous',
          backgroundColor: pressed ? colors.rowPressed : 'transparent',
        },
      ]}
    >
      {body}
    </Pressable>
  )
}

/** Chân card: `left` (thường `PillButton`) và `right` (thường `CardLink`), mỗi nút ≥ 44pt. */
export function CardFooter({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View style={{ flexShrink: 1 }}>{left}</View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
    </View>
  )
}

/** Nút viên: nền `fill`, chữ `accentText` đậm, icon nhỏ tuỳ chọn. */
export function PillButton({
  label,
  icon: Icon,
  onPress,
  testID,
  accessibilityHint,
}: {
  label: string
  icon?: LucideIcon
  onPress: () => void
  testID?: string
  accessibilityHint?: string
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      onPress={() => {
        haptics.selection()
        onPress()
      }}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 18,
        borderRadius: 999,
        borderCurve: 'continuous',
        backgroundColor: pressed ? colors.rowPressed : colors.fill,
      })}
    >
      {Icon ? <Icon size={16} strokeWidth={2.5} color={colors.accentText} aria-hidden /> : null}
      <Text weight="semibold" size={17} numberOfLines={1} style={{ color: colors.accentText }}>
        {label}
      </Text>
    </Pressable>
  )
}

/** Liên kết xám "Xem tất cả ›" ở chân card. */
export function CardLink({
  label,
  onPress,
  testID,
}: {
  label?: string
  onPress: () => void
  testID?: string
}) {
  const { t } = useTranslation('common')
  const { colors } = useTheme()
  const text = label ?? t('seeAll')
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={text}
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      onPress={() => {
        haptics.selection()
        onPress()
      }}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 }}
    >
      <Text muted weight="medium" size={17} numberOfLines={1}>
        {text}
      </Text>
      <ChevronRight size={18} color={colors.chevron} aria-hidden />
    </Pressable>
  )
}
