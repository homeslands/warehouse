import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import {
  formatQuantity,
  LevelPill,
  stockLevel,
  type InventoryItem,
  type StockLevel,
} from '@/entities/inventory'
import { useTheme } from '@/shared/theme/useTheme'
import { ROW_PRESS_DELAY_MS, Text } from '@/shared/ui'

export type StockRowProps = {
  item: InventoryItem
  locale: 'vi' | 'en'
  onPress: (item: InventoryItem) => void
}

/** Lề trái của đường kẻ giữa các dòng (bằng lề nội dung của dòng). */
export const STOCK_ROW_INSET = 16
/** Cột số tồn thẳng hàng giữa các dòng. */
const QUANTITY_COLUMN = 76

type Level = Exclude<StockLevel, 'ok'>
/** Viên nhãn cuối dòng (ngắn) + chữ đầy đủ cho đọc màn hình. */
const PILL: Record<Level, { short: string; full: string }> = {
  out: { short: 'inventory:pillOut', full: 'inventory:badgeOut' },
  low: { short: 'inventory:pillLow', full: 'inventory:alertBelow' },
  high: { short: 'inventory:pillHigh', full: 'inventory:alertAbove' },
}

/**
 * Một dòng tồn (hướng C): tên một dòng; dòng phụ "mã (code) · loại · giữ n"; bên phải số tồn (numeric)
 * thẳng cột + đơn vị gốc bên dưới; cuối dòng viên `LevelPill` ("Hết" / "Thiếu" / "Vượt") khi cần
 * chú ý. Nền do khối bo góc của nhóm vẽ.
 */
export const StockRow = memo(function StockRow({ item, locale, onPress }: StockRowProps) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  const level = stockLevel(item)
  const pill = level === 'ok' ? null : PILL[level]

  const reserved =
    item.reservedQuantity > 0
      ? t('reservedShort', { value: formatQuantity(item.reservedQuantity, locale) })
      : null
  const subtitle = [item.materialCode, item.typeName, reserved].filter(Boolean).join(' · ')
  const subtitleRest = [item.typeName, reserved].filter(Boolean).join(' · ')
  const quantity = formatQuantity(item.quantity, locale)
  const unitName = item.baseUnit?.name
  const label = [
    item.materialName,
    subtitle,
    unitName ? `${quantity} ${unitName}` : quantity,
    pill ? t(pill.full) : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Pressable
      testID="stock-row"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(item)}
      // rowPressed: cùng token với dòng phiếu ở danh sách (ImportFormRow/ExportFormRow).
      unstable_pressDelay={ROW_PRESS_DELAY_MS}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 68,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: pressed ? colors.rowPressed : colors.card,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text weight="semibold" size={16} numberOfLines={1}>
          {item.materialName}
        </Text>
        <Text muted size={13} numberOfLines={1}>
          <Text code muted size={13}>
            {item.materialCode}
          </Text>
          {subtitleRest ? ` · ${subtitleRest}` : null}
        </Text>
      </View>
      <View style={{ minWidth: QUANTITY_COLUMN, maxWidth: '38%', alignItems: 'flex-end' }}>
        <Text numeric weight="semibold" size={16} numberOfLines={1}>
          {quantity}
        </Text>
        {unitName ? (
          <Text muted size={11.5} numberOfLines={1}>
            {unitName}
          </Text>
        ) : null}
      </View>
      {pill ? <LevelPill level={level as Level} label={t(pill.short)} /> : null}
    </Pressable>
  )
})
