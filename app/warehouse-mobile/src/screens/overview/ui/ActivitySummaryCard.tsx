import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Flow } from '@/features/overview-period'
import { useTheme } from '@/shared/theme/useTheme'
import {
  CardFooter,
  CardHeader,
  DashCard,
  PillButton,
  StateValue,
  Text,
  type ValueState,
} from '@/shared/ui'
import { ClipboardCheck } from '@/shared/ui/icons'

import { MiniBars } from './MiniBars'

export type ActivitySeries = { key: 'import' | 'export'; flow: Flow }

/**
 * Thẻ "Phiếu đã xác nhận" (nhóm Hoạt động, theo kỳ đang lọc): tổng số phiếu nhập + xuất, "● 4 nhập · ● 1
 * xuất", cột đôi mini theo ô thời gian. Chuỗi vắng (thiếu quyền) không có trong `series`. Chuỗi vượt trần
 * → tổng "–" + chú thích, chuỗi đó không vẽ cột. Nút viên "Chi tiết" → màn chi tiết Hoạt động.
 */
export function ActivitySummaryCard({
  series,
  onPress,
}: {
  series: ActivitySeries[]
  onPress: () => void
}) {
  const { t } = useTranslation('overview')
  const { colors } = useTheme()
  const color = { import: colors.accent, export: colors.chart2 }

  let state: ValueState = 'ok'
  for (const s of ['failed', 'loading', 'truncated'] as const)
    if (series.some((x) => x.flow.state === s)) {
      state = s
      break
    }
  const ok = series.flatMap((s) => (s.flow.state === 'ok' ? [{ ...s, flow: s.flow }] : []))
  const total = ok.reduce((acc, s) => acc + s.flow.count, 0)
  const stale = ok.some((s) => s.flow.stale)
  const countOf = (s: ActivitySeries) => (s.flow.state === 'ok' ? s.flow.count : '–')
  const showLegend = state === 'ok' || state === 'truncated'
  const parts = series.map((s) => t(`activity.${s.key}s`, { count: countOf(s) }))
  const value =
    state === 'ok'
      ? [`${total}${t('activity.unit')}`, ...parts].join(', ')
      : state === 'truncated'
        ? [t('money.truncated'), ...parts].join(', ')
        : state === 'failed'
          ? t('loadError')
          : t('money.loading')
  // Cột: chỉ các chuỗi có số, cùng kỳ (dữ liệu tạm của kỳ cũ có thể khác số ô → chỉ vẽ khi cùng độ dài).
  const bars = ok.filter((s) => s.flow.bars.buckets.length === ok[0]?.flow.bars.buckets.length)

  return (
    <DashCard testID="activity-summary">
      <CardHeader icon={ClipboardCheck} label={t('activity.title')} />
      <View
        testID="activity-main"
        accessible
        accessibilityLabel={t('activity.a11y', { value })}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}
      >
        <View style={{ flex: 1 }}>
          <StateValue
            id="activity-total"
            state={state}
            value={String(total)}
            unit={t('activity.unit')}
            dim={stale}
          />
        </View>
        {showLegend ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              flexShrink: 1,
              opacity: stale ? 0.45 : 1,
            }}
          >
            {series.map((s, i) => (
              <Fragment key={s.key}>
                {i > 0 ? (
                  <Text muted size={15}>
                    {' · '}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View
                    aria-hidden
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color[s.key] }}
                  />
                  <Text muted numeric size={15}>
                    {t(`activity.${s.key}s`, { count: countOf(s) })}
                  </Text>
                </View>
              </Fragment>
            ))}
          </View>
        ) : null}
      </View>
      {bars.length > 0 ? (
        <MiniBars
          testID="mini-bars-activity"
          series={bars.map((s) => ({ values: s.flow.bars.count, color: color[s.key] }))}
          elapsed={bars[0].flow.elapsed}
          height={56}
          dim={stale}
        />
      ) : null}
      <CardFooter
        left={
          <PillButton
            testID="activity-detail"
            label={t('detailButton')}
            accessibilityHint={t('openDetailHint')}
            onPress={onPress}
          />
        }
      />
    </DashCard>
  )
}
