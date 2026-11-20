import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { formatQuantity, type InventoryItem } from '@/entities/inventory'
import type { ReorderRow as Row } from '@/features/reorder'
import { useTheme } from '@/shared/theme/useTheme'
import { PlainListRow, RowLine, RowStatus, Text } from '@/shared/ui'
import { Package } from '@/shared/ui/icons'

/** Tên đơn vị theo `unitSlug`: trong `units`, rồi đơn vị gốc; không thấy → rỗng. */
export function reorderUnitName(item: InventoryItem, unitSlug: string): string {
  const u = item.units.find((x) => x.unitSlug === unitSlug)
  if (u) return u.unitName
  return item.baseUnit?.slug === unitSlug ? item.baseUnit.name : ''
}

/** `yyyy-MM-dd` → `dd/MM` (không qua `Date`: tránh lệch múi giờ). */
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export type ReorderRowProps = {
  row: Row
  locale: 'vi' | 'en'
  first: boolean
  /** Dòng của nhóm "Cần chọn nơi đặt". */
  choose: boolean
  /** Bên bán của nhóm chứa dòng (để ghi "Còn ở: …" các bên khác). */
  groupSupplierSlug: string | null
  onPress: (materialSlug: string) => void
}

/**
 * Một dòng đề xuất đặt hàng — cùng khuôn `StockRow` (`PlainListRow` + 3 `RowLine`): [tên | "đặt N đơn vị" /
 * "Nhập số" / "Chọn nơi đặt"] / [mã · tồn | "Thiếu n" / "Sắp thiếu" / "Đã đặt dd/MM"] / [ngưỡng | gợi ý /
 * bạn đã sửa / không gửi lại] (+ "Còn ở: …" khi vật tư có nhiều bên bán). Dòng đã đặt mờ.
 */
export const ReorderRow = memo(function ReorderRow({
  row,
  locale,
  first,
  choose,
  groupSupplierSlug,
  onPress,
}: ReorderRowProps) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  const { item, level, qty, orderedAt, suggestedBase, suppliers } = row
  const fmt = (n: number) => formatQuantity(n, locale)
  const baseName = item.baseUnit?.name ?? ''
  const ordered = orderedAt != null

  const qtyText = qty ? `${fmt(qty.value)} ${reorderUnitName(item, qty.unitSlug)}`.trim() : null
  const stock = [t('reorder.stockOf', { value: fmt(item.quantity) }), baseName]
    .filter(Boolean)
    .join(' ')
  const min = item.effectiveMinimumInventory
  const max = item.effectiveMaximumInventory
  const range = [
    min > 0 ? t('gaugeMin', { value: fmt(min) }) : null,
    max > 0 ? t('gaugeMax', { value: fmt(max) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const status = ordered
    ? {
        label: t('reorder.orderedOn', { date: dayMonth(orderedAt) }),
        color: colors.statusSuccess,
      }
    : level === 'yellow'
      ? { label: t('reorder.soon'), color: colors.warningText }
      : {
          label:
            item.quantity <= 0
              ? t('badgeOut')
              : t('levelShort', { value: fmt(min - item.quantity) }),
          color: colors.statusWarning,
        }

  const edited =
    qty != null &&
    (qty.unitSlug !== item.baseUnit?.slug || (suggestedBase != null && qty.value !== suggestedBase))
  const hint = ordered
    ? t('reorder.hintSkipped')
    : qty == null
      ? null
      : edited || suggestedBase == null
        ? t('reorder.hintEdited')
        : t('reorder.hintSuggested')

  const others = suppliers.filter((s) => s.slug !== groupSupplierSlug)
  const alsoAt =
    suppliers.length > 1
      ? t(choose ? 'reorder.availableAt' : 'reorder.alsoAt', {
          names: others.map((s) => s.name).join(', '),
        })
      : null

  const end = choose ? (
    <Text weight="medium" size={15} numberOfLines={1} style={{ color: colors.accent }}>
      {t('reorder.pickSupplier')}
    </Text>
  ) : qtyText ? (
    <Text numeric weight="medium" size={16} numberOfLines={1}>
      {t('reorder.orderQty', { qty: qtyText })}
    </Text>
  ) : (
    <Text weight="medium" size={15} numberOfLines={1} style={{ color: colors.accent }}>
      {t('reorder.enterQty')}
    </Text>
  )

  return (
    <View style={{ opacity: ordered ? 0.55 : 1 }}>
      <PlainListRow
        testID={`reorder-row-${item.materialSlug}`}
        accessibilityLabel={[item.materialName, item.materialCode, stock, status.label, qtyText]
          .filter(Boolean)
          .join(', ')}
        onPress={() => onPress(item.materialSlug)}
        first={first}
        tile={{ icon: Package }}
      >
        <RowLine end={end}>
          <Text weight="semibold" size={16} numberOfLines={1}>
            {item.materialName}
          </Text>
        </RowLine>
        <RowLine end={<RowStatus label={status.label} color={status.color} />}>
          <Text muted size={14} numberOfLines={1}>
            <Text numeric muted size={14}>
              {item.materialCode}
            </Text>
            {` · ${stock}`}
          </Text>
        </RowLine>
        <RowLine
          end={
            hint ? (
              <Text muted size={13} numberOfLines={1}>
                {hint}
              </Text>
            ) : null
          }
        >
          <Text muted numeric size={13} numberOfLines={1}>
            {range}
          </Text>
        </RowLine>
        {alsoAt ? (
          <Text muted size={13} numberOfLines={1}>
            {alsoAt}
          </Text>
        ) : null}
      </PlainListRow>
    </View>
  )
})
