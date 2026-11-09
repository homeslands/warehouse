import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import { formatLotLabel } from '@/entities/export-form'
import { useMaterialBatches, type MaterialBatch } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { useLotInfo } from '@/features/export-draft'
import { formatQuantity, type FormatLocale } from '@/shared/lib/format'
import { haptics } from '@/shared/lib/haptics'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, ChoiceCard, Text } from '@/shared/ui'

export type BatchPickerProps = {
  materialSlug: string
  /** `batchSlug` đang chọn; `null` = tự động (HSD sớm nhất). */
  value: string | null
  /** `null` = chọn "Tự động". */
  onChange: (batch: MaterialBatch | null) => void
  /** HSD của lô đang chọn (từ dòng phiếu): nhãn của lô đã hết hàng khi chưa tải được thông tin lô. */
  expiryDate?: string | null
}

/** HSD sớm trước, không HSD cuối; cùng HSD giữ thứ tự của server. */
function byExpiry(lots: readonly MaterialBatch[]): MaterialBatch[] {
  return lots
    .map((lot, i) => ({ lot, i }))
    .sort((a, b) => {
      const x = a.lot.expiryDate
      const y = b.lot.expiryDate
      if (x === y) return a.i - b.i
      if (x === null) return 1
      if (y === null) return -1
      return x < y ? -1 : 1
    })
    .map((e) => e.lot)
}

/**
 * Chọn lô cho một dòng phiếu xuất: "Tự động (HSD sớm nhất)" rồi các lô CÒN HÀNG của vật tư trong kho
 * hiện tại (HSD sớm trước, không HSD cuối). Mỗi lô: `formatLotLabel` (HSD · ngày nhập) + "còn n <đv gốc>".
 * Lô đã hết hàng không hiện (lô đã chọn mà hết hàng thì chỉ còn chọn lại được lô khác / Tự động).
 * Không có nhãn riêng — nằm ngay dưới dòng "Lô" của sheet sửa dòng (bung khi chạm dòng đó).
 */
export function BatchPicker({ materialSlug, value, onChange, expiryDate }: BatchPickerProps) {
  const { t, i18n } = useTranslation(['exportForms', 'common'])
  const { colors } = useTheme()
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'vi'
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const query = useMaterialBatches(warehouseSlug, materialSlug)
  const lots = useMemo(() => byExpiry(query.data ?? []), [query.data])
  // Lô đang chọn mà không còn trong danh sách còn hàng (đã hết): vẫn hiện, để luôn thấy lô hiện tại.
  const soldOut = value !== null && !!query.data && !lots.some((l) => l.slug === value)
  const info = useLotInfo(
    warehouseSlug,
    soldOut ? [{ materialSlug, batchSlug: value }] : undefined,
  ).get(value ?? '')
  const now = new Date()

  const choose = (batch: MaterialBatch | null) => {
    if ((batch?.slug ?? null) === value) return
    haptics.selection()
    onChange(batch)
  }

  return (
    <View style={{ gap: 8 }}>
      <ChoiceCard
        title={t('exportForms:lot.auto')}
        selected={value === null}
        onPress={() => choose(null)}
      />
      {soldOut
        ? (() => {
            const label = formatLotLabel(
              { expiryDate: info?.expiryDate ?? expiryDate ?? null, entryDate: info?.entryDate },
              now,
              locale,
            )
            return (
              <ChoiceCard
                title={label}
                subtitle={t('exportForms:lot.soldOut')}
                accessibilityLabel={t('exportForms:lot.soldOutA11y', { label })}
                selected
                onPress={() => undefined}
              />
            )
          })()
        : null}
      {query.isError && !query.data ? (
        <View style={{ gap: 8, alignItems: 'center' }}>
          <Text muted>{t('exportForms:lot.loadError')}</Text>
          <Button
            variant="outline"
            loading={query.isFetching}
            onPress={() => void query.refetch({ cancelRefetch: false })}
          >
            {t('common:retry')}
          </Button>
        </View>
      ) : !query.data ? (
        <ActivityIndicator
          accessibilityLabel={t('exportForms:lot.loading')}
          color={colors.mutedForeground}
        />
      ) : lots.length === 0 ? (
        <Text muted size={13} style={{ marginLeft: 2 }}>
          {t('exportForms:lot.empty')}
        </Text>
      ) : (
        lots.map((lot) => {
          const label = formatLotLabel(lot, now, locale)
          const stock = t('exportForms:lot.available', {
            n: formatQuantity(lot.availableQuantity, locale, 6),
            unit: lot.baseUnit?.name ?? '',
          }).trim()
          return (
            <ChoiceCard
              key={lot.slug}
              title={label}
              subtitle={stock}
              accessibilityLabel={t('exportForms:lot.optionA11y', { label, stock })}
              selected={lot.slug === value}
              onPress={() => choose(lot)}
            />
          )
        })
      )}
    </View>
  )
}
