import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { expiryStatus, formatQuantity, type MaterialBatch } from '@/entities/inventory'
import { formatEntryDate, formatFullDate } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import { ListGroup, Text } from '@/shared/ui'

import { TabMessage } from './TabMessage'

export type BatchListProps = {
  /** `undefined` = chưa tải xong lần đầu. */
  batches: MaterialBatch[] | undefined
  /** Lần tải đầu lỗi (chưa có dữ liệu). */
  failed: boolean
  retrying: boolean
  onRetry: () => void
  locale: 'vi' | 'en'
  today: Date
}

function BatchRow({
  batch,
  locale,
  today,
}: {
  batch: MaterialBatch
  locale: 'vi' | 'en'
  today: Date
}) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  const fmt = (v: number) => formatQuantity(v, locale)
  const expiry = expiryStatus(batch.expiryDate, today)
  const warn = expiry.kind === 'soon' || expiry.kind === 'expired'
  const expiryText =
    expiry.kind === 'none' || !batch.expiryDate
      ? t('batchNoExpiry')
      : [
          t('batchExpiry', { date: formatFullDate(batch.expiryDate) }),
          expiry.kind === 'expired'
            ? t('batchExpired')
            : expiry.kind === 'soon'
              ? expiry.days === 0
                ? t('batchExpiresToday')
                : t('batchDaysLeft', { count: expiry.days ?? 0 })
              : null,
        ]
          .filter(Boolean)
          .join(' · ')
  const title = t('batchEntry', {
    date: formatEntryDate(batch.entryDate, today) ?? batch.entryDate,
  })
  const available = fmt(batch.availableQuantity)
  const note =
    batch.reservedQuantity > 0
      ? t('reservedShort', { value: fmt(batch.reservedQuantity) })
      : t('batchOfImported', { value: fmt(batch.quantity) })

  return (
    <View
      testID="batch-row"
      accessible
      accessibilityLabel={[title, expiryText, available, note].join(', ')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 58,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numeric weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        <Text
          size={12.5}
          weight={warn ? 'medium' : 'regular'}
          muted={!warn}
          numeric
          numberOfLines={1}
          style={warn ? { color: colors.destructiveText } : undefined}
        >
          {expiryText}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1, maxWidth: '45%' }}>
        <Text numeric weight="semibold" size={16} numberOfLines={1}>
          {available}
        </Text>
        <Text muted weight="medium" size={11.5} numberOfLines={1}>
          {note}
        </Text>
      </View>
    </View>
  )
}

/**
 * Tab "Theo lô": mỗi lô còn hàng một dòng (ngày nhập, hạn dùng — đỏ khi sắp/đã hết hạn — số còn lấy
 * được + "giữ n" / "trên x nhập"). Thứ tự lấy nguyên từ API (hạn gần trước, không hạn dùng cuối).
 */
export function BatchList({ batches, failed, retrying, onRetry, locale, today }: BatchListProps) {
  const { t } = useTranslation('inventory')

  if (!batches && failed)
    return <TabMessage text={t('batchesError')} onRetry={onRetry} retrying={retrying} />
  if (!batches) return <TabMessage loading loadingLabel={t('loading')} />
  if (batches.length === 0) return <TabMessage text={t('batchesEmpty')} />
  return (
    <ListGroup large inset={16}>
      {batches.map((b) => (
        <BatchRow key={b.slug} batch={b} locale={locale} today={today} />
      ))}
    </ListGroup>
  )
}
