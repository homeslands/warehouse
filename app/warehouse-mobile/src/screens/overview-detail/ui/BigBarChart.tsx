import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native'
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Line } from 'react-native-svg'

import { niceMax } from '@/features/overview-period'
import { haptics } from '@/shared/lib/haptics'
import { motion } from '@/shared/lib/motion'
import { useTheme } from '@/shared/theme/useTheme'
import { Text, type ValueState } from '@/shared/ui'

const PLOT_HEIGHT = 180
const AXIS_WIDTH = 44
/** Chiều cao cột xám khi đang tải (phần của trục). */
const SKELETON = 0.25
/** Ô đã qua mà bằng 0: vạch thấp để thấy "có ô, không có phiếu". */
const ZERO_BAR = 2
const GROW_MS = 500

export type BarSeries = { key: 'import' | 'export'; values: number[]; color: string }

/**
 * Biểu đồ cột lớn của màn chi tiết: một cột (hoặc cặp cột Nhập / Xuất) mỗi ô thời gian của kỳ, trục giá trị
 * bên phải (`niceMax`), nhãn thời gian thưa bên dưới, đường trung bình đứt nét + nhãn. Ô chưa tới (sau
 * hôm nay / giờ hiện tại) để trống. Chạm / kéo ngang → chọn một ô (rung chọn khi đổi ô, ô chưa tới kẹp về
 * ô cuối đã qua); chạm lại ô đang chọn hoặc thả tay sau khi kéo → bỏ chọn. Kéo dọc vẫn cuộn trang
 * (`failOffsetY`). Trình đọc màn hình: cả biểu đồ là MỘT phần tử `adjustable` (vuốt lên / xuống đổi ô).
 * Trạng thái: đang tải → cột xám; lỗi → câu báo lỗi; vượt trần → "–" + chú thích (không vẽ số thiếu).
 */
export function BigBarChart({
  buckets,
  series,
  elapsed,
  state,
  dim,
  average,
  axisLabel,
  tickLabel,
  selected,
  onSelect,
  accessibilityLabel,
  accessibilityValue,
}: {
  buckets: string[]
  /** Chỉ các chuỗi có số (cùng độ dài `buckets`). */
  series: BarSeries[]
  /** Số ô đã qua từ đầu kỳ. */
  elapsed: number
  state: ValueState
  /** Số tạm của kỳ cũ (đang tải kỳ mới): mờ, không chọn được. */
  dim?: boolean
  average?: { value: number; label: string; color: string }
  axisLabel: (value: number) => string
  tickLabel: (bucket: string, index: number) => string | null
  selected: number | null
  onSelect: (index: number | null) => void
  accessibilityLabel: string
  accessibilityValue: string
}) {
  const { t } = useTranslation('overview')
  const { colors } = useTheme()
  const n = buckets.length
  const last = Math.max(0, Math.min(elapsed, n) - 1)
  const interactive = state === 'ok' && !dim && series.length > 0 && n > 0
  const max = Math.max(0, ...series.flatMap((s) => s.values), average?.value ?? 0)
  const axis = niceMax(max)

  // --- chọn ô (chạm / kéo) ---
  const width = useRef(0)
  const panning = useRef(false)
  // Ref (không đọc prop): nhiều sự kiện kéo có thể tới trước khi kịp render lại.
  const lastIndex = useRef<number | null>(selected)
  useEffect(() => {
    lastIndex.current = selected
  }, [selected])
  const indexAt = (x: number) =>
    width.current > 0 ? Math.min(last, Math.max(0, Math.floor((x / width.current) * n))) : null
  const select = (index: number | null) => {
    if (!interactive || index === lastIndex.current) return
    if (index !== null) haptics.selection()
    lastIndex.current = index
    onSelect(index)
  }

  const pan = usePanGesture({
    testID: 'detail-pan',
    activeOffsetX: [-8, 8],
    failOffsetY: [-10, 10],
    runOnJS: true,
    onActivate: (e) => {
      panning.current = true
      select(indexAt(e.x))
    },
    onUpdate: (e) => select(indexAt(e.x)),
    onFinalize: () => {
      // Chỉ bỏ chọn khi thật sự đã kéo (pan thua tap cũng gọi onFinalize).
      if (!panning.current) return
      panning.current = false
      select(null)
    },
  })
  const tap = useTapGesture({
    testID: 'detail-tap',
    // Vuốt nhanh theo chiều dọc bắt đầu từ biểu đồ không được tính là chạm chọn ô.
    maxDistance: 10,
    runOnJS: true,
    onActivate: (e) => {
      const index = indexAt(e.x)
      select(index === lastIndex.current ? null : index)
    },
  })
  const gesture = useCompetingGestures(pan, tap)

  const onA11yAction = (e: AccessibilityActionEvent) => {
    const cur = lastIndex.current
    if (e.nativeEvent.actionName === 'increment') select(cur === null ? 0 : Math.min(last, cur + 1))
    if (e.nativeEvent.actionName === 'decrement') select(cur === null ? last : Math.max(0, cur - 1))
  }

  const y = (v: number) => (v / axis.max) * PLOT_HEIGHT
  const dual = series.length === 2

  let plot
  if (state === 'failed') {
    plot = (
      <View style={{ height: PLOT_HEIGHT, justifyContent: 'center', paddingHorizontal: 8 }}>
        <Text
          accessibilityRole="alert"
          size={15}
          style={{ color: colors.destructiveText, textAlign: 'center' }}
        >
          {t('detail.failed')}
        </Text>
      </View>
    )
  } else if (state === 'truncated' || (state === 'ok' && series.length === 0)) {
    plot = (
      <View style={{ height: PLOT_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Text numeric weight="bold" size={28} muted>
          –
        </Text>
        <Text muted size={13}>
          {t('money.truncated')}
        </Text>
      </View>
    )
  } else {
    plot = (
      <>
        <View style={{ flexDirection: 'row', opacity: dim ? 0.45 : 1 }}>
          <GestureDetector gesture={gesture}>
            <View
              testID="detail-plot"
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={accessibilityLabel}
              accessibilityValue={{ text: accessibilityValue }}
              accessibilityHint={interactive ? t('detail.chartHint') : undefined}
              accessibilityActions={
                interactive ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
              }
              onAccessibilityAction={onA11yAction}
              onLayout={(e: LayoutChangeEvent) => {
                width.current = e.nativeEvent.layout.width
              }}
              style={{ flex: 1, height: PLOT_HEIGHT }}
            >
              {axis.ticks.map((tick) => (
                <View
                  key={tick}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: y(tick),
                    height: 1,
                    backgroundColor: colors.separator,
                  }}
                />
              ))}
              <View style={{ flex: 1, flexDirection: 'row' }}>
                {buckets.map((bucket, i) => (
                  <View
                    key={bucket}
                    testID={`bar-${bucket}`}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      opacity: selected === null || selected === i ? 1 : 0.35,
                    }}
                  >
                    {selected === i ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          width: 1,
                          backgroundColor: colors.chevron,
                        }}
                      />
                    ) : null}
                    {i < elapsed ? (
                      <View
                        style={{
                          width: '72%',
                          maxWidth: dual ? 24 : 18,
                          flexDirection: 'row',
                          alignItems: 'flex-end',
                          gap: 1,
                        }}
                      >
                        {series.map((s) => (
                          <Bar
                            key={s.key}
                            testID={`bar-${bucket}-${s.key}`}
                            loading={state === 'loading'}
                            height={
                              state === 'loading' ? SKELETON * PLOT_HEIGHT : y(s.values[i] ?? 0)
                            }
                            color={
                              state === 'loading' || !(s.values[i] ?? 0) ? colors.fill : s.color
                            }
                          />
                        ))}
                        {state === 'loading' && series.length === 0 ? (
                          <Bar loading height={SKELETON * PLOT_HEIGHT} color={colors.fill} />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
              {average && state === 'ok' && average.value > 0 ? (
                <View
                  testID="detail-avg"
                  style={{
                    position: 'absolute',
                    pointerEvents: 'none',
                    left: 0,
                    right: 0,
                    bottom: y(average.value),
                    opacity: selected === null ? 1 : 0.35,
                  }}
                >
                  <Text
                    numeric
                    weight="semibold"
                    size={11}
                    numberOfLines={1}
                    style={{ color: average.color, marginBottom: 2, marginLeft: 2 }}
                  >
                    {average.label}
                  </Text>
                  <Svg height={1.5} width="100%">
                    <Line
                      x1="0"
                      y1="0.75"
                      x2="100%"
                      y2="0.75"
                      stroke={average.color}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  </Svg>
                </View>
              ) : null}
            </View>
          </GestureDetector>
          <View aria-hidden style={{ width: AXIS_WIDTH, height: PLOT_HEIGHT }}>
            {state === 'ok'
              ? axis.ticks.map((tick) => (
                  <Text
                    key={tick}
                    numeric
                    muted
                    size={11}
                    numberOfLines={1}
                    style={{
                      position: 'absolute',
                      left: 6,
                      right: 0,
                      bottom: y(tick) - 7,
                    }}
                  >
                    {axisLabel(tick)}
                  </Text>
                ))
              : null}
          </View>
        </View>
        <View aria-hidden style={{ flexDirection: 'row', marginRight: AXIS_WIDTH, height: 16 }}>
          {buckets.map((bucket, i) => {
            const label = tickLabel(bucket, i)
            return (
              <View key={bucket} style={{ flex: 1, alignItems: 'center' }}>
                {label !== null ? (
                  <Text
                    numeric
                    size={11}
                    numberOfLines={1}
                    weight={selected === i ? 'semibold' : 'regular'}
                    muted={selected !== i}
                    style={{ width: 32, textAlign: 'center' }}
                  >
                    {label}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      </>
    )
  }

  return <View testID="detail-chart">{plot}</View>
}

/** Một cột: mọc lên tới `height` (Reduce Motion → hiện ngay); bằng 0 → vạch thấp; đang tải → xám tĩnh. */
function Bar({
  height,
  color,
  loading,
  testID,
}: {
  height: number
  color: string
  loading?: boolean
  testID?: string
}) {
  const reduced = useReducedMotion()
  const target = Math.max(ZERO_BAR, height)
  const h = useSharedValue(reduced || loading ? target : 0)
  useEffect(() => {
    h.value =
      reduced || loading
        ? target
        : withTiming(target, { duration: GROW_MS, easing: motion.easeOut })
  }, [target, reduced, loading, h])
  const style = useAnimatedStyle(() => ({ height: h.value }))
  return (
    <Animated.View
      testID={testID}
      style={[
        { flex: 1, backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
        style,
      ]}
    />
  )
}
