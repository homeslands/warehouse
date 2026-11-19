import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Circle, G } from 'react-native-svg'

import type { StockOverview } from '@/entities/inventory'
import { motion } from '@/shared/lib/motion'
import { useTheme } from '@/shared/theme/useTheme'
import { BigValue, CardFooter, CardHeader, CardLink, DashCard, Text } from '@/shared/ui'
import { CircleDot } from '@/shared/ui/icons'

import { donutSlices, okPercent, type DonutSlice } from '../model/donut'

const SIZE = 64
const STROKE = 9
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R
/** Đoạn nhỏ nhất ≥ một chấm tròn (đầu bo lấn STROKE/2 mỗi phía); khe giữa hai đoạn ≈ 3pt. */
const MIN_FRACTION = STROKE / C + 0.002
const GAP = 3 / C
const DRAW_MS = 700

type Key = DonutSlice['key']

/**
 * Thẻ "Tình trạng tồn kho" (nhóm Tồn kho): "69 % ổn định" + dòng "1 hết · 2 dưới mức · 1 vượt mức" bên
 * trái, vòng nhỏ 4 đoạn bên phải (hình học `donutSlices`). Link "Xem tồn kho ›" → tab Tồn kho không lọc. Đoạn chạy vào khi
 * hiện lần đầu (Reduce Motion → vẽ ngay).
 */
export function StockSummaryCard({
  counts,
  onPress,
}: {
  counts: StockOverview
  onPress: () => void
}) {
  const { t } = useTranslation('overview')
  const { colors } = useTheme()
  const reduced = useReducedMotion()
  const progress = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) progress.value = 1
    else progress.value = withTiming(1, { duration: DRAW_MS, easing: motion.easeOut })
  }, [reduced, progress])

  const color: Record<Key, string> = {
    out: colors.destructive,
    low: colors.warning,
    high: colors.info,
    ok: colors.success,
  }
  const slices = donutSlices(counts, { gap: GAP, minFraction: MIN_FRACTION })
  const pct = okPercent(counts)

  return (
    <DashCard testID="stock-card">
      <CardHeader
        icon={CircleDot}
        label={t('stockCardTitle')}
        trailing={t('stockTotal', { count: counts.total })}
      />
      <View
        testID="stock-card-main"
        accessible
        accessibilityLabel={t('stockLabel', {
          total: counts.total,
          out: counts.out,
          low: counts.low,
          high: counts.high,
        })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          {pct === null ? (
            <BigValue value="–" />
          ) : (
            <BigValue value={String(pct)} unit={t('stockOkUnit')} />
          )}
          <Text muted numeric size={15}>
            {t('stockBreakdown', { out: counts.out, low: counts.low, high: counts.high })}
          </Text>
        </View>
        <View testID="stock-donut" aria-hidden style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={colors.fill}
              strokeWidth={STROKE}
              fill="none"
            />
            {slices.map((s) => (
              <Slice
                key={s.key}
                slice={s}
                whole={slices.length === 1}
                color={color[s.key]}
                progress={progress}
              />
            ))}
          </Svg>
        </View>
      </View>
      <CardFooter
        right={<CardLink testID="overview-stock" label={t('viewStock')} onPress={onPress} />}
      />
    </DashCard>
  )
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Một đoạn: nét đứt dài `drawn`, xoay tới điểm bắt đầu; `progress` 0 → 1 kéo nét theo chiều kim đồng hồ. */
function Slice({
  slice,
  whole,
  color,
  progress,
}: {
  slice: DonutSlice
  whole: boolean
  color: string
  progress: SharedValue<number>
}) {
  const inset = whole ? 0 : STROKE / 2
  const drawn = whole ? C : Math.max(0.01, (slice.end - slice.start) * C - STROKE)
  const angle = -90 + slice.start * 360 + (inset / C) * 360
  const props = useAnimatedProps(() => ({
    strokeDashoffset: drawn * (1 - progress.value),
    strokeOpacity: progress.value > 0.001 ? 1 : 0,
  }))
  return (
    <G transform={`rotate(${angle} ${SIZE / 2} ${SIZE / 2})`}>
      <AnimatedCircle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap={whole ? 'butt' : 'round'}
        strokeDasharray={[drawn, C]}
        fill="none"
        animatedProps={props}
      />
    </G>
  )
}
