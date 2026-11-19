import { Stack, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, View } from 'react-native'

import { useExportConfirmedForms } from '@/entities/export-form'
import { useImportConfirmedForms } from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  bucketIndex,
  compareDelta,
  compareName,
  comparisonNow,
  elapsedBuckets,
  flowOf,
  highlight,
  lastDays,
  PeriodBar,
  periodLabel,
  periodRange,
  previousRange,
  splitAmount,
  usePeriodStore,
  useRefetchStale,
  weekdayShort,
  type QueryKeyParts,
  type Flow,
  type Period,
  type SlimForm,
  type Translate,
} from '@/features/overview-period'
import { formatMoney, formatMoneyCompact } from '@/shared/lib/format'
import { useTheme } from '@/shared/theme/useTheme'
import {
  CardHeader,
  DashCard,
  GroupTitle,
  Screen,
  StateValue,
  Text,
  type ValueState,
} from '@/shared/ui'
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck } from '@/shared/ui/icons'

import {
  axisMoney,
  bucketText,
  bucketUnit,
  isDetailMetric,
  sortForms,
  spanText,
  tickText,
  whenText,
  type DetailMetric,
} from './model/detail'
import { BigBarChart, type BarSeries } from './ui/BigBarChart'
import { PeriodForms } from './ui/PeriodForms'

const PAGE = 20

/** Chỉ phiếu theo kỳ (cùng key với Tóm tắt) làm mới khi focus / foreground. */
const refetchOnReturn = ({ root, extra }: QueryKeyParts) =>
  (root === 'import-forms' || root === 'export-forms') &&
  (extra as { period?: boolean } | undefined)?.period === true
const GROUP_GAP = 24

type Kind = 'import' | 'export'
type Part = { key: Kind; flow: Flow; forms?: SlimForm[] }
type OkFlow = Extract<Flow, { state: 'ok' }>

/** Lỗi > đang tải > vượt trần > có số (luật chung của Tổng quan). */
function stateOf(parts: Part[]): ValueState {
  for (const s of ['failed', 'loading', 'truncated'] as const)
    if (parts.some((p) => p.flow.state === s)) return s
  return 'ok'
}

/** Có quyền xem chi tiết `metric` không: Nhập / Xuất cần quyền đọc phiếu tương ứng, Hoạt động cần một trong hai. */
function allowedFor(metric: DetailMetric | null, canImport: boolean, canExport: boolean) {
  if (metric === 'import') return canImport
  if (metric === 'export') return canExport
  if (metric === 'activity') return canImport || canExport
  return false
}

/**
 * Màn chi tiết Nhập kho / Xuất kho / Hoạt động (push từ Tóm tắt, `/overview/[metric]`). Mở với kỳ + độ lùi
 * đang chọn ở Tóm tắt rồi giữ kỳ RIÊNG (đổi ở đây không đổi Tóm tắt). Trên → dưới: bộ lọc kỳ → thẻ tổng
 * ("TỔNG" tiền đầy đủ / "SỐ PHIẾU", dòng phụ khoảng ngày · số phiếu · so kỳ trước) + biểu đồ cột lớn (chạm /
 * kéo chọn ô → dòng tổng thành số của ô) → "Nổi bật" (ẩn khi kỳ không có phiếu) → "Phiếu trong kỳ" (Nhập /
 * Xuất theo tiền giảm dần, Hoạt động gộp theo ngày mới nhất; 20 dòng + "Xem thêm"; chạm → màn xem phiếu ở
 * tab Nhập / Xuất). Dữ liệu dùng chung query với Tóm tắt (`use*ConfirmedForms`, cùng key). `metric` lạ hoặc
 * thiếu quyền → về Tóm tắt, không gọi API.
 */
export function OverviewDetailScreen() {
  const params = useLocalSearchParams<{ metric?: string }>()
  const { t, i18n } = useTranslation('overview')
  const lng: 'vi' | 'en' = i18n.language === 'en' ? 'en' : 'vi'
  const tr: Translate = useCallback((key, options) => t(key, options) as string, [t])
  const { colors } = useTheme()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const slug = useWarehouseStore((s) => s.current?.slug)

  const canImport = can(user, 'IMPORT_FORM_READ')
  const canExport = can(user, 'EXPORT_FORM_READ')
  const metric = isDetailMetric(params.metric) ? params.metric : null
  const allowed = allowedFor(metric, canImport, canExport)
  const showImport = allowed && canImport && (metric === 'import' || metric === 'activity')
  const showExport = allowed && canExport && (metric === 'export' || metric === 'activity')
  const compare = metric !== 'activity'

  // Chỉ khi đang xem màn này và còn phiên: đăng xuất / tab ở nền không được đẩy về Tóm tắt.
  const focused = useIsFocused()
  useEffect(() => {
    if (!allowed && user && focused) router.navigate('/overview')
  }, [allowed, user, focused, router])

  // Kỳ RIÊNG của màn: lấy giá trị đang chọn ở Tóm tắt lúc mở, sau đó không đụng tới store.
  const [view, setView] = useState(() => {
    const { period, offset } = usePeriodStore.getState()
    return { period, offset }
  })
  const setPeriod = (period: Period) => setView({ period, offset: 0 })
  const back = () => setView((v) => ({ ...v, offset: v.offset + 1 }))
  const forward = () => setView((v) => ({ ...v, offset: Math.max(0, v.offset - 1) }))

  // Như Tóm tắt: hôm nay tính lại mỗi render (qua nửa đêm → kỳ mới), kỳ so sánh cắt tới giờ hiện tại.
  const wall = new Date()
  const today = lastDays(new Date(), 1)[0]
  const todayDate = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [today])
  const info = useMemo(
    () => periodRange(view.period, view.offset, todayDate),
    [view.period, view.offset, todayDate],
  )
  const prevRange0 = previousRange(info, wall)
  const range = { startDate: info.startDate, endDate: info.endDate }
  const prevRange = { startDate: prevRange0.startDate, endDate: prevRange0.endDate }

  const importCur = useImportConfirmedForms(slug, range, showImport)
  const importPrev = useImportConfirmedForms(slug, prevRange, showImport && compare)
  const exportCur = useExportConfirmedForms(slug, range, showExport)
  const exportPrev = useExportConfirmedForms(slug, prevRange, showExport && compare)
  const now = comparisonNow(info, wall, [
    showImport ? importCur.dataUpdatedAt : 0,
    showExport ? exportCur.dataUpdatedAt : 0,
  ])
  const prevInfo = previousRange(info, now)
  // Focus / foreground: làm mới phiếu đã cũ (cũng render lại để sang ngày mới).
  useRefetchStale(slug, refetchOnReturn)

  // Chọn ô + số dòng đang mở của danh sách: gắn với kỳ / kho đang xem — đổi kỳ thì tự về mặc định.
  const viewKey = `${slug}:${view.period}:${view.offset}`
  const [pick, setPick] = useState({ key: viewKey, bucket: null as string | null, limit: PAGE })
  const current = pick.key === viewKey ? pick : { key: viewKey, bucket: null, limit: PAGE }

  const [pulling, setPulling] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const refetchers = [
    showImport && importCur.refetch,
    showImport && compare && importPrev.refetch,
    showExport && exportCur.refetch,
    showExport && compare && exportPrev.refetch,
  ]
  const onRefresh = async () => {
    // `refetch()` bỏ qua `enabled`: chưa có kho thì không được gọi `/warehouses/undefined/...`.
    if (!slug) return
    setPulling(true)
    try {
      await Promise.all(
        refetchers.map((refetch) => (refetch ? refetch({ cancelRefetch: false }) : null)),
      )
    } finally {
      if (mounted.current) setPulling(false)
    }
  }

  const title = metric && allowed ? t(`detail.title.${metric}`) : ''
  if (!allowed || !metric)
    return (
      <Screen edges={['left', 'right']} tone="grouped">
        <Stack.Screen options={{ title }} />
      </Screen>
    )

  const parts: Part[] = [
    showImport
      ? { key: 'import' as const, flow: flowOf(importCur, info, now), forms: importCur.data?.forms }
      : null,
    showExport
      ? { key: 'export' as const, flow: flowOf(exportCur, info, now), forms: exportCur.data?.forms }
      : null,
  ].filter((p) => p !== null)
  const state = stateOf(parts)
  const okParts = parts.flatMap((p) => (p.flow.state === 'ok' ? [{ ...p, flow: p.flow }] : []))
  const stale = okParts.some((p) => p.flow.stale)
  const isMoney = metric !== 'activity'
  const valuesOf = (f: OkFlow) => (isMoney ? f.bars.amount : f.bars.count)

  // Ô của biểu đồ: theo dữ liệu đang có (số tạm của kỳ cũ giữ ô của kỳ cũ); chưa có số → ô của kỳ mới.
  const first = okParts[0]?.flow
  const buckets = first ? first.bars.buckets : info.buckets
  const elapsed = first ? first.elapsed : elapsedBuckets(info, now)
  const sameShape = okParts.filter((p) => p.flow.bars.buckets.length === buckets.length)
  const tint = { import: colors.accentText, export: colors.chart2 }
  const barColor = { import: colors.accent, export: colors.chart2 }
  const series: BarSeries[] = sameShape.map((p) => ({
    key: p.key,
    values: valuesOf(p.flow),
    color: barColor[p.key],
  }))
  const chartState: ValueState =
    state === 'failed' || state === 'loading' ? state : series.length > 0 ? 'ok' : 'truncated'

  const found = current.bucket === null ? -1 : buckets.indexOf(current.bucket)
  const selected = found === -1 || stale || chartState !== 'ok' ? null : found
  const onSelect = (index: number | null) =>
    setPick({ ...current, bucket: index === null ? null : (buckets[index] ?? null) })

  const sumAt = (pick: (f: OkFlow) => number[], i: number | null) =>
    sameShape.reduce((acc, p) => {
      const values = pick(p.flow)
      return acc + (i === null ? values.reduce((a, b) => a + b, 0) : (values[i] ?? 0))
    }, 0)
  const amountAt = (i: number | null) => sumAt((f) => f.bars.amount, i)
  const countAt = (i: number | null) => sumAt((f) => f.bars.count, i)
  const countOf = (key: Kind, i: number | null) => {
    const p = okParts.find((x) => x.key === key)
    if (!p) return '–'
    return i === null ? p.flow.bars.count.reduce((a, b) => a + b, 0) : (p.flow.bars.count[i] ?? 0)
  }

  // --- số to + dòng phụ ---
  const money = (v: number) => formatMoney(Math.round(v), lng)
  const valueText = (i: number | null) =>
    isMoney ? money(amountAt(i)) : `${countAt(i)}${t('activity.unit')}`
  const [num, unit] =
    state !== 'ok'
      ? ['', '']
      : isMoney
        ? splitAmount(money(amountAt(selected)))
        : [String(countAt(selected)), t('activity.unit')]
  const kindsText = (i: number | null) =>
    parts.map((p) => t(`activity.${p.key}s`, { count: countOf(p.key, i) })).join(' · ')
  let sub: string
  if (selected !== null) {
    sub = [
      bucketText(buckets[selected], info.period, lng, tr),
      isMoney ? t('detail.forms', { count: countAt(selected) }) : kindsText(selected),
    ].join(' · ')
  } else {
    const items = [spanText(info, lng, tr)]
    if (state === 'ok' && !stale) {
      if (isMoney) {
        items.push(t('detail.forms', { count: countAt(null) }))
        const prevQ = metric === 'import' ? importPrev : exportPrev
        const d = compareDelta(
          okParts[0].flow,
          flowOf(prevQ, prevInfo),
          compareName(prevInfo, lng, tr),
          lng,
          tr,
        )
        if (d) items.push(d.text)
      } else items.push(kindsText(null))
    } else if (state === 'truncated' && !isMoney && okParts.length > 0) items.push(kindsText(null))
    sub = items.join(' · ')
  }

  // --- trung bình (chỉ Nhập / Xuất): tổng / số ô đã qua ---
  const unitKey = bucketUnit(info.period)
  const average =
    isMoney && chartState === 'ok' && !stale && elapsed > 0
      ? (() => {
          const value = amountAt(null) / elapsed
          return {
            value,
            label: t(`detail.avg.${unitKey}`, {
              value: formatMoneyCompact(Math.round(value), lng),
            }),
            color: tint[metric as Kind],
          }
        })()
      : undefined

  // --- nổi bật ---
  const best =
    state === 'ok' && !stale && sameShape.length > 0
      ? highlight(
          info,
          buckets.map((_, i) => (isMoney ? amountAt(i) : countAt(i))),
          now,
        )
      : null

  // --- danh sách phiếu ---
  const listForms = sortForms(
    okParts.flatMap((p) =>
      (p.forms ?? []).filter((f) => stale || bucketIndex(f.createdAt, info) !== -1),
    ),
    metric,
  )
  const someTruncated = parts.some((p) => p.flow.state === 'truncated')

  const headIcon =
    metric === 'import' ? ArrowDownToLine : metric === 'export' ? ArrowUpFromLine : ClipboardCheck
  const span = spanText(info, lng, tr)

  return (
    <Screen edges={['left', 'right']} tone="grouped">
      <Stack.Screen options={{ title }} />
      <ScrollView
        testID="detail-scroll"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: GROUP_GAP }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => void onRefresh()}
            tintColor={colors.mutedForeground}
          />
        }
      >
        <PeriodBar
          period={view.period}
          label={periodLabel(info, lng, tr)}
          canForward={view.offset > 0}
          onPeriod={setPeriod}
          onBack={back}
          onForward={forward}
        />

        <View
          testID="detail-summary"
          style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            borderCurve: 'continuous',
            paddingHorizontal: 20,
            paddingVertical: 18,
            gap: 12,
          }}
        >
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text testID="detail-caps" muted weight="semibold" size={13} style={{ flex: 1 }}>
                {t(isMoney ? 'detail.total' : 'detail.count').toUpperCase()}
              </Text>
              {!isMoney && series.length > 0 ? (
                <View aria-hidden style={{ flexDirection: 'row', gap: 10 }}>
                  {series.map((s) => (
                    <View
                      key={s.key}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <View
                        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }}
                      />
                      <Text muted size={12}>
                        {t(`detail.kind.${s.key}`)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View accessible accessibilityLiveRegion="polite">
              <StateValue
                id="detail-total"
                state={state}
                value={num}
                unit={unit}
                size={34}
                dim={stale}
              />
            </View>
            <Text testID="detail-sub" numeric muted size={13} style={{ opacity: stale ? 0.45 : 1 }}>
              {sub}
            </Text>
          </View>
          <BigBarChart
            buckets={buckets}
            series={chartState === 'loading' ? [] : series}
            elapsed={elapsed}
            state={chartState}
            dim={stale}
            average={average}
            axisLabel={(v) => (isMoney ? axisMoney(v, lng) : String(v))}
            tickLabel={(bucket, i) =>
              tickText(bucket, i, info.period, (d) => weekdayShort(d, lng), tr)
            }
            selected={selected}
            onSelect={onSelect}
            accessibilityLabel={t('detail.chartA11y', { name: title, span })}
            accessibilityValue={
              selected !== null
                ? `${bucketText(buckets[selected], info.period, lng, tr)}: ${valueText(selected)}`
                : state === 'ok'
                  ? valueText(null)
                  : ''
            }
          />
        </View>

        {best ? (
          <View style={{ gap: 10 }}>
            <GroupTitle title={t('detail.highlightTitle')} />
            <DashCard testID="detail-highlight">
              <CardHeader icon={headIcon} label={title} />
              <Text size={17} style={{ lineHeight: 24 }}>
                <Trans
                  t={t}
                  i18nKey={`detail.hl.${metric}.${unitKey}`}
                  values={{
                    when: whenText(best.bucket, info.period, lng, tr),
                    value: isMoney
                      ? formatMoneyCompact(Math.round(best.value), lng)
                      : t('detail.forms', { count: best.value }),
                  }}
                  components={{ b: <Text numeric weight="bold" size={17} /> }}
                />
                {best.times >= 2
                  ? t(`detail.hl.times.${unitKey}`, { times: best.times })
                  : t('detail.hl.end')}
              </Text>
            </DashCard>
          </View>
        ) : null}

        {state !== 'failed' ? (
          <View style={{ gap: 10 }}>
            <GroupTitle title={t('detail.listTitle')} />
            {someTruncated ? (
              <Text testID="detail-list-note" muted size={13} style={{ paddingHorizontal: 4 }}>
                {t('detail.listTruncated')}
              </Text>
            ) : null}
            {okParts.length > 0 && state !== 'loading' ? (
              <PeriodForms
                forms={listForms}
                limit={current.limit}
                period={info.period}
                showKind={metric === 'activity'}
                dim={stale}
                onMore={() => setPick({ ...current, limit: current.limit + PAGE })}
                onOpen={(f) =>
                  router.push({
                    pathname: f.kind === 'import' ? '/import/[formSlug]' : '/export/[formSlug]',
                    params: { formSlug: f.slug },
                  })
                }
              />
            ) : state === 'loading' ? (
              <Text muted size={15} style={{ paddingHorizontal: 4 }}>
                {t('detail.loading')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
