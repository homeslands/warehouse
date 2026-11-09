import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View, type LayoutChangeEvent } from 'react-native'

import { formatQuantity } from '@/entities/inventory'
import { useTheme } from '@/shared/theme/useTheme'
import { Text } from '@/shared/ui'

export type LevelGaugeProps = {
  quantity: number
  /** `effectiveMinimumInventory` / `effectiveMaximumInventory`; 0 = chưa đặt. */
  min: number
  max: number
  /** Đơn vị gốc (vd "bao"); không có thì câu tình trạng chỉ có số. */
  unit?: string
  locale: 'vi' | 'en'
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const pct = (v: number): `${number}%` => `${Math.round(v * 1000) / 10}%`
const TRACK_HEIGHT = 6
const THUMB = 18
const TICK_WIDTH = 2
const TICK_HEIGHT = 10

/**
 * Thanh min/max kiểu Slider iOS: capsule cao 6 với 3 vùng (dưới min vàng nhạt / bình thường xanh nhạt
 * / trên max xanh dương nhạt), vạch min/max 2×10 trên thanh, tồn hiện tại là nút tròn trắng như thumb
 * UISlider (tâm đúng mốc, kẹp trong khung). Thang đo: max ở 80% thanh (chừa chỗ phần vượt), chỉ có min
 * thì min ở giữa. Dưới thanh là hàng chú thích "Tối thiểu / Tối đa" + giá trị, rồi câu tình trạng nói
 * rõ thiếu / còn / vượt bao nhiêu. Không đặt ngưỡng nào → không vẽ.
 */
export function LevelGauge({ quantity, min, max, unit, locale }: LevelGaugeProps) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  const [width, setWidth] = useState(0)
  if (min <= 0 && max <= 0) return null

  const top = max > 0 ? Math.max(max, min) * 1.25 : min * 2
  const minAt = min > 0 ? clamp(min / top) : 0
  const maxAt = max > 0 ? Math.max(minAt, clamp(max / top)) : 1
  const markAt = clamp(quantity / top)

  const fmt = (v: number) => formatQuantity(v, locale)
  const amount = (v: number) => (unit ? `${fmt(v)} ${unit}` : fmt(v))
  const status =
    min > 0 && quantity < min
      ? { text: t('gaugeBelow', { value: amount(min - quantity) }), color: colors.warningText }
      : max > 0 && quantity > max
        ? { text: t('gaugeAbove', { value: amount(quantity - max) }), color: colors.infoText }
        : max > 0
          ? {
              text: t('gaugeRoom', { value: amount(max - quantity) }),
              color: colors.mutedForeground,
            }
          : {
              text: t('gaugeAboveMin', { value: amount(quantity - min) }),
              color: colors.mutedForeground,
            }

  const minValue = min > 0 ? amount(min) : null
  const maxValue = max > 0 ? amount(max) : null
  const minLabel = minValue ? t('gaugeMin', { value: minValue }) : null
  const maxLabel = maxValue ? t('gaugeMax', { value: maxValue }) : null

  // Tâm nút tròn đúng mốc, kẹp để nút không tràn khỏi khung (chưa đo xong → theo phần trăm).
  const thumbLeft =
    width > 0
      ? Math.min(Math.max(markAt * width - THUMB / 2, 0), width - THUMB)
      : (pct(markAt) as number | `${number}%`)
  const tick = (at: number, id: 'min' | 'max') => (
    <View
      key={id}
      testID={`level-gauge-${id}-tick`}
      style={{
        position: 'absolute',
        left: width > 0 ? at * width - TICK_WIDTH / 2 : pct(at),
        top: (THUMB - TICK_HEIGHT) / 2,
        width: TICK_WIDTH,
        height: TICK_HEIGHT,
        borderRadius: 1,
        backgroundColor: colors.mutedForeground,
      }}
    />
  )
  const caption = (id: 'min' | 'max', title: string, value: string, end: boolean) => (
    <View
      key={id}
      testID={`level-gauge-${id}`}
      style={{ gap: 1, alignItems: end ? 'flex-end' : 'flex-start' }}
    >
      <Text muted size={12}>
        {title}
      </Text>
      <Text numeric weight="semibold" size={15}>
        {value}
      </Text>
    </View>
  )

  return (
    <View
      testID="level-gauge"
      accessible
      accessibilityLabel={t('gaugeLabel', {
        value: fmt(quantity),
        thresholds: [minLabel, maxLabel, status.text].filter(Boolean).join(', '),
      })}
      style={{ gap: 10, paddingTop: 6 }}
    >
      <View
        aria-hidden
        testID="level-gauge-track"
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: THUMB, justifyContent: 'center' }}
      >
        <View
          style={{
            flexDirection: 'row',
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            overflow: 'hidden',
          }}
        >
          <View style={{ width: pct(minAt), backgroundColor: colors.warningSoft }} />
          <View style={{ width: pct(maxAt - minAt), backgroundColor: colors.successSoft }} />
          <View style={{ flex: 1, backgroundColor: colors.infoSoft }} />
        </View>
        {min > 0 ? tick(minAt, 'min') : null}
        {max > 0 ? tick(maxAt, 'max') : null}
        <View
          testID="level-gauge-mark"
          style={{
            position: 'absolute',
            left: thumbLeft,
            top: 0,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            // Thumb iOS trắng ở cả sáng/tối (`segmentThumb` tối là xám, không dùng được).
            backgroundColor: '#ffffff',
            borderWidth: 0.5,
            borderColor: colors.separator,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
              },
              default: { elevation: 2 },
            }),
          }}
        />
      </View>
      {minValue || maxValue ? (
        <View
          style={{ flexDirection: 'row', justifyContent: minValue ? 'space-between' : 'flex-end' }}
        >
          {minValue ? caption('min', t('gaugeMinTitle'), minValue, false) : null}
          {maxValue ? caption('max', t('gaugeMaxTitle'), maxValue, true) : null}
        </View>
      ) : null}
      <Text weight="medium" size={13} style={{ color: status.color }}>
        {status.text}
      </Text>
    </View>
  )
}
