import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  formatQuantity,
  stockLevel,
  type InventoryItem,
  type StockLevel,
} from '@/entities/inventory'
import type { ColorTokens } from '@/shared/theme/tokens'
import { useTheme } from '@/shared/theme/useTheme'
import { PlainListRow, RowLine, RowStatus, Text } from '@/shared/ui'
import { Package } from '@/shared/ui/icons'

export type StockRowProps = {
  item: InventoryItem
  locale: 'vi' | 'en'
  onPress: (item: InventoryItem) => void
  /** Dòng đầu nhóm "Cần chú ý" / "Bình thường" (không đường kẻ phía trên). */
  first: boolean
}

/** Chữ đầy đủ của mức tồn cho đọc màn hình. */
const LEVEL_LABEL: Record<Exclude<StockLevel, 'ok'>, string> = {
  out: 'inventory:badgeOut',
  low: 'inventory:alertBelow',
  high: 'inventory:alertAbove',
}

/** Màu chữ mức tồn (nghiêng, đủ AA) — điểm màu DUY NHẤT của dòng, cùng bộ màu trạng thái phiếu. */
function levelColor(colors: ColorTokens, level: Exclude<StockLevel, 'ok'>) {
  return { out: colors.destructiveText, low: colors.statusWarning, high: colors.statusAccent }[
    level
  ]
}

/**
 * Một dòng tồn — CÙNG KHUÔN dòng phiếu Nhập/Xuất (`PlainListRow`, chốt 2026-11-19 "A + cách hiển thị tồn
 * của B"): ô icon "hộp" trung tính; [tên 16 semibold | "168 bao" — số đen 16 medium, đơn vị 14 xám] /
 * [mã · loại | mức tồn CHỮ NGHIÊNG màu ở đúng chỗ trạng thái phiếu: "Hết hàng" / "Thiếu 32" / "Dư 36"] /
 * [ngưỡng bằng chữ "Tối thiểu 200 · Tối đa 800" | "giữ n"]. Không thước / biểu đồ trên dòng (thước đầy đủ
 * ở màn chi tiết).
 */
export const StockRow = memo(function StockRow({ item, locale, onPress, first }: StockRowProps) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  const level = stockLevel(item)
  const min = item.effectiveMinimumInventory
  const max = item.effectiveMaximumInventory
  const fmt = (n: number) => formatQuantity(n, locale)
  const unitName = item.baseUnit?.name

  const reserved =
    item.reservedQuantity > 0 ? t('reservedShort', { value: fmt(item.reservedQuantity) }) : null
  const subtitle = [item.materialCode, item.typeName].filter(Boolean).join(' · ')
  const quantity = fmt(item.quantity)
  const levelText =
    level === 'out'
      ? t('badgeOut')
      : level === 'low'
        ? t('levelShort', { value: fmt(min - item.quantity) })
        : level === 'high'
          ? t('levelOver', { value: fmt(item.quantity - max) })
          : null
  // Ngưỡng 0 = chưa đặt → bỏ phần đó; không ngưỡng nào → hàng 3 chỉ còn "giữ n" (nếu có).
  const range = [
    min > 0 ? t('gaugeMin', { value: fmt(min) }) : null,
    max > 0 ? t('gaugeMax', { value: fmt(max) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const label = [
    item.materialName,
    subtitle,
    unitName ? `${quantity} ${unitName}` : quantity,
    level === 'ok' ? null : t(LEVEL_LABEL[level]),
    levelText && level !== 'out' ? levelText : null,
    range,
    reserved,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <PlainListRow
      testID="stock-row"
      accessibilityLabel={label}
      onPress={() => onPress(item)}
      first={first}
      tile={{ icon: Package, testID: 'stock-tile' }}
    >
      <RowLine
        end={
          <Text testID="stock-row-quantity" numeric weight="medium" size={16} numberOfLines={1}>
            {quantity}
            {unitName ? (
              <Text testID="stock-row-unit" muted size={14}>
                {` ${unitName}`}
              </Text>
            ) : null}
          </Text>
        }
      >
        <Text weight="semibold" size={16} numberOfLines={1}>
          {item.materialName}
        </Text>
      </RowLine>
      <RowLine
        end={
          level !== 'ok' && levelText ? (
            <RowStatus
              testID="stock-row-level"
              label={levelText}
              color={levelColor(colors, level)}
            />
          ) : null
        }
      >
        <Text muted size={14} numberOfLines={1}>
          {subtitle}
        </Text>
      </RowLine>
      {range || reserved ? (
        <RowLine
          end={
            reserved ? (
              <Text muted numeric size={13} numberOfLines={1}>
                {reserved}
              </Text>
            ) : null
          }
        >
          <Text testID="stock-row-range" muted numeric size={13} numberOfLines={1}>
            {range}
          </Text>
        </RowLine>
      ) : null}
    </PlainListRow>
  )
})
