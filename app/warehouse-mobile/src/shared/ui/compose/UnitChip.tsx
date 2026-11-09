import { ChevronDown } from '../icons'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable } from 'react-native'

import { chooseAction } from '../../lib/native-confirm'
import { useTheme } from '../../theme/useTheme'
import { Text } from '../Text'

/** `hint` = tỉ lệ so với đơn vị gốc ("24 chai") → tuỳ chọn ghi "gói (24 chai)". */
export type UnitOption = { slug: string; name: string; hint?: string | null }

/** Android `chooseAction` là Alert — chỉ chứa 3 nút. */
const ANDROID_ALERT_MAX = 3

/**
 * Chip đơn vị "hộp ▾" trên dòng phiếu (xuất / nhập): chạm → action sheet GỐC (`chooseAction`, tiêu đề = tên vật
 * tư) các đơn vị của vật tư, đơn vị đang chọn ghi "(đang chọn)"; chọn đơn vị khác → `onPick(slug)`.
 * Android hơn 3 đơn vị → `onAndroidOverflow()` (bảng sửa dòng có đủ đơn vị) vì Alert chỉ chứa 3 nút. ≤ 1 đơn
 * vị hoặc đang khoá → chỉ là chữ.
 */
export function UnitChip({
  title,
  current,
  units,
  loadUnits,
  disabled,
  onPick,
  onAndroidOverflow,
  variant = 'chip',
}: {
  title: string
  /** Đơn vị đang chọn của dòng. */
  current: { slug: string; name: string }
  /** `null` = chưa tải (dòng nhập): chip vẫn bấm được và gọi `loadUnits` trước khi mở. */
  units: readonly UnitOption[] | null
  /** Tải đơn vị khi `units` là `null`; `null` trả về = không tải được (màn tự báo lỗi). */
  loadUnits?: () => Promise<readonly UnitOption[] | null>
  disabled: boolean
  onPick: (slug: string) => void
  /** Android + hơn 3 đơn vị: Alert không đủ nút → màn mở bảng sửa dòng. */
  onAndroidOverflow: () => void
  /** `value`: chữ accent "chai ⌄" không nền — giá trị của dòng "Đơn vị" kiểu Cài đặt iOS. */
  variant?: 'chip' | 'value'
}) {
  const unitName = current.name
  const optionName = (u: UnitOption) => (u.hint ? `${u.name} (${u.hint})` : u.name)
  const { t } = useTranslation('common')
  const { colors } = useTheme()

  if (disabled || (units ? units.length <= 1 : !loadUnits)) {
    return (
      <Text
        size={variant === 'value' ? 17 : 14}
        weight={variant === 'value' ? 'regular' : 'medium'}
        numberOfLines={1}
      >
        {unitName}
      </Text>
    )
  }

  const open = async () => {
    const all = units ?? (await loadUnits?.()) ?? null
    if (!all || all.length <= 1) return
    if (Platform.OS === 'android' && all.length > ANDROID_ALERT_MAX) {
      onAndroidOverflow()
      return
    }
    const i = await chooseAction({
      title,
      actions: all.map((u) => ({
        label:
          u.slug === current.slug
            ? t('compose.unit.current', { unit: optionName(u) })
            : optionName(u),
      })),
      cancelLabel: t('common:cancel'),
    })
    const picked = i === null ? undefined : all[i]
    if (picked && picked.slug !== current.slug) onPick(picked.slug)
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('compose.unit.a11y', { unit: unitName })}
      onPress={() => void open()}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={({ pressed }) => ({
        minHeight: variant === 'value' ? 44 : 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: variant === 'value' ? 0 : 8,
        borderRadius: 999,
        backgroundColor: variant === 'value' ? undefined : colors.fill,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        size={variant === 'value' ? 17 : 14}
        weight={variant === 'value' ? 'regular' : 'medium'}
        numberOfLines={1}
        style={variant === 'value' ? { color: colors.accent } : undefined}
      >
        {unitName}
      </Text>
      <ChevronDown
        size={variant === 'value' ? 16 : 14}
        color={variant === 'value' ? colors.accent : colors.mutedForeground}
        aria-hidden
      />
    </Pressable>
  )
}
