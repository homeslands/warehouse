import { Lock, LockOpen, type LucideIcon } from '@/shared/ui/icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import {
  altUnit,
  formatQuantity,
  LevelPill,
  stockLevel,
  toUnit,
  type InventoryItem,
} from '@/entities/inventory'
import { useAuthStore } from '@/entities/session'
import { canEditThresholds } from '@/features/stock-threshold'
import { useTheme } from '@/shared/theme/useTheme'
import { ROW_PRESS_DELAY_MS, Text } from '@/shared/ui'

import { LevelGauge } from './LevelGauge'

export type StockHeroProps = {
  item: InventoryItem
  locale: 'vi' | 'en'
  /** Tab Lịch sử: thu gọn một dòng "168 bao · còn lấy được 138". */
  compact?: boolean
}

function Cell({
  testID,
  icon: Icon,
  label,
  value,
}: {
  testID: string
  icon: LucideIcon
  label: string
  value: string
}) {
  const { colors, radius } = useTheme()
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1,
        gap: 3,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: radius.xl,
        backgroundColor: colors.cell,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon size={12} strokeWidth={2.2} color={colors.mutedForeground} aria-hidden />
        <Text muted weight="medium" size={12} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text numeric weight="semibold" size={17} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

/**
 * Thẻ số tồn (mockup phone 2): số tồn numeric 34 + đơn vị gốc + nhãn mức tồn; dòng quy đổi "≈ 8,4 tấn ·
 * 1 tấn = 20 bao" khi có đơn vị quy đổi; hai ô Đang giữ / Còn lấy được; thanh min/max khi có ngưỡng.
 */
export function StockHero({ item, locale, compact }: StockHeroProps) {
  const { t } = useTranslation('inventory')
  const { colors, radius } = useTheme()
  const router = useRouter()
  const canEdit = useAuthStore((s) => canEditThresholds(s.user))
  const fmt = (v: number) => formatQuantity(v, locale)
  const base = item.baseUnit?.name
  const level = stockLevel(item)
  const levelLabel = { out: t('badgeOut'), low: t('alertBelow'), high: t('alertAbove') }

  if (compact)
    return (
      <View
        testID="stock-hero"
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 11,
          borderRadius: radius.groupLarge,
          backgroundColor: colors.card,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text numeric weight="semibold" size={26} numberOfLines={1} style={{ flexShrink: 1 }}>
            {fmt(item.quantity)}
          </Text>
          {base ? (
            <Text muted weight="medium" numberOfLines={1}>
              {base}
            </Text>
          ) : null}
        </View>
        <Text muted size={13}>
          {t('heroAvailableInline')}
        </Text>
        <Text numeric weight="semibold" size={15}>
          {fmt(item.availableQuantity)}
        </Text>
      </View>
    )

  const alt = altUnit(item)
  const altLine = alt
    ? [
        t('altQuantity', { value: fmt(toUnit(item.quantity, alt)), unit: alt.unitName }),
        base ? t('conversion', { unit: alt.unitName, rate: fmt(alt.conversionRate), base }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const hasThreshold = item.effectiveMinimumInventory > 0 || item.effectiveMaximumInventory > 0
  const editThreshold = () =>
    router.navigate({ pathname: '/stock-threshold', params: { materialSlug: item.materialSlug } })

  return (
    <View
      testID="stock-hero"
      style={{
        gap: 12,
        padding: 16,
        borderRadius: radius.groupLarge,
        backgroundColor: colors.card,
      }}
    >
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text
              numeric
              weight="semibold"
              size={34}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ flexShrink: 1, letterSpacing: -1 }}
            >
              {fmt(item.quantity)}
            </Text>
            {base ? (
              <Text muted weight="medium" numberOfLines={1}>
                {base}
              </Text>
            ) : null}
          </View>
          {level !== 'ok' ? <LevelPill level={level} label={levelLabel[level]} /> : null}
        </View>
        {altLine ? (
          <Text muted size={13}>
            {altLine}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Cell
          testID="stock-reserved"
          icon={Lock}
          label={t('heroReserved')}
          value={fmt(item.reservedQuantity)}
        />
        <Cell
          testID="stock-available"
          icon={LockOpen}
          label={t('heroAvailable')}
          value={fmt(item.availableQuantity)}
        />
      </View>
      {canEdit ? (
        <Pressable
          testID="stock-threshold-edit"
          accessibilityRole="button"
          accessibilityLabel={hasThreshold ? t('thresholdEditA11y') : t('thresholdSet')}
          onPress={editThreshold}
          unstable_pressDelay={ROW_PRESS_DELAY_MS}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {hasThreshold ? (
            <>
              <Text muted weight="medium" size={13}>
                {t('thresholdTitle')}
              </Text>
              <Text weight="medium" size={15} style={{ color: colors.primary }}>
                {t('thresholdEdit')}
              </Text>
            </>
          ) : (
            <Text weight="medium" size={15} style={{ color: colors.primary }}>
              {t('thresholdSet')}
            </Text>
          )}
        </Pressable>
      ) : null}
      <LevelGauge
        quantity={item.quantity}
        min={item.effectiveMinimumInventory}
        max={item.effectiveMaximumInventory}
        unit={base}
        locale={locale}
      />
    </View>
  )
}
