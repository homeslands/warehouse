import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, View } from 'react-native'

import {
  useExportConfirmedForms,
  useExportFormCount,
  useExportFormSum,
} from '@/entities/export-form'
import {
  expiryStatus,
  stockOverview,
  useBatchCount,
  useExpiringBatches,
  useInventory,
} from '@/entities/inventory'
import {
  useImportConfirmedForms,
  useImportFormCount,
  useImportFormSum,
} from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  compareName,
  comparisonNow,
  flowOf,
  lastDays,
  PeriodBar,
  periodLabel,
  periodRange,
  previousRange,
  usePeriodStore,
  useRefetchStale,
  type QueryKeyParts,
  type Translate,
} from '@/features/overview-period'
import { useTheme } from '@/shared/theme/useTheme'
import { GroupTitle, Screen, Text } from '@/shared/ui'

import { expiryCutoffs } from './model/money'
import {
  expiryHref,
  overviewTodos,
  STOCK_HREF,
  type OverviewHref,
  type Todo,
  type TodoCount,
  type TodoKey,
} from './model/todos'
import { ActivitySummaryCard, type ActivitySeries } from './ui/ActivitySummaryCard'
import { AttentionCard, type ExpiryRow } from './ui/AttentionCard'
import { MoneySection, type Metric, type PendingPart } from './ui/MoneySection'
import { StockSummaryCard } from './ui/StockSummaryCard'
import { TodoCard } from './ui/TodoCard'

type Counts = Partial<Record<TodoKey, TodoCount>>

/** Lỗi khi làm mới không xoá số đang có: chỉ "lỗi" khi chưa có số nào. */
const pendingPart = (q: {
  data?: { sum: number; count: number; truncated: boolean }
  isError: boolean
}): PendingPart => ({ data: q.data, failed: q.isError && q.data === undefined })

const GROUP_GAP = 24

/** Query làm mới khi focus / foreground: tồn, số lô hạn dùng, số đếm / tổng / phiếu theo kỳ của phiếu nhập / xuất. */
const refetchOnReturn = ({ root, kind, extra }: QueryKeyParts) => {
  if (root === 'inventory') return kind === 'list' || kind === 'expiry'
  const flags = extra as { count?: boolean; sum?: boolean; period?: boolean } | undefined
  return (
    (root === 'import-forms' || root === 'export-forms') &&
    (flags?.count === true || flags?.sum === true || flags?.period === true)
  )
}

/**
 * Tab Tổng quan kiểu "Sức khoẻ · Tóm tắt", trên → dưới: dòng ngày → bộ lọc kỳ (Ngày / Tuần / Tháng / Năm,
 * lùi / tiến) → "Cần chú ý" (Hạn dùng, chỉ khi có lô quá hạn / sắp hết hạn) → "Tiền" (theo kỳ) → "Việc cần
 * làm" (một card, cả kho, hiện tại) → "Tồn kho" → "Hoạt động" (theo kỳ). Chỉ gọi API của phần người dùng được
 * thấy; một API lỗi chỉ làm phần đó hiện "!". Chạm thẻ Nhập / Xuất, nút "Chi tiết" của Hoạt động → màn chi tiết
 * `/overview/[metric]`; hàng việc cần làm → tab đích kèm `preset`; Hạn dùng → sheet `/expiry-batches`.
 */
export function OverviewScreen() {
  const { t, i18n } = useTranslation('overview')
  const lng: 'vi' | 'en' = i18n.language === 'en' ? 'en' : 'vi'
  const tr: Translate = useCallback((key, options) => t(key, options) as string, [t])
  const { colors } = useTheme()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const warehouse = useWarehouseStore((s) => s.current)
  const slug = warehouse?.slug
  const period = usePeriodStore((s) => s.period)
  const offset = usePeriodStore((s) => s.offset)
  const setPeriod = usePeriodStore((s) => s.setPeriod)
  const back = usePeriodStore((s) => s.back)
  const forward = usePeriodStore((s) => s.forward)

  const canImport = can(user, 'IMPORT_FORM_READ')
  const canExport = can(user, 'EXPORT_FORM_READ')
  const canStock = can(user, 'MATERIAL_READ') && can(user, 'WAREHOUSE_READ')

  // Kỳ, kỳ so sánh, mốc hạn dùng tính lại mỗi render (memo theo hôm nay): qua nửa đêm (render kế tiếp /
  // quay lại tab / app về foreground) → ngày mới. Kỳ so sánh cắt tới CÙNG thời điểm với số kỳ này
  // (`comparisonNow`: lúc tải, không phải giờ vẽ lại); key query chỉ có ngày nên không đổi trong ngày.
  const wall = new Date()
  const today = lastDays(new Date(), 1)[0]
  const todayDate = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [today])
  const info = useMemo(() => periodRange(period, offset, todayDate), [period, offset, todayDate])
  const prevRange0 = previousRange(info, wall)
  const cutoffs = useMemo(() => expiryCutoffs(todayDate), [todayDate])
  const range = { startDate: info.startDate, endDate: info.endDate }
  const prevRange = { startDate: prevRange0.startDate, endDate: prevRange0.endDate }

  const importDraft = useImportFormCount(slug, 'DRAFT', canImport)
  const exportDraft = useExportFormCount(slug, 'DRAFT', canExport)
  const exportPending = useExportFormCount(slug, 'PENDING', canExport)
  // Tiền + Hoạt động: MỘT nguồn — mọi phiếu đã xác nhận của kỳ / kỳ so sánh, gom theo ô thời gian ở máy.
  const importCur = useImportConfirmedForms(slug, range, canImport)
  const importPrev = useImportConfirmedForms(slug, prevRange, canImport)
  const exportCur = useExportConfirmedForms(slug, range, canExport)
  const exportPrev = useExportConfirmedForms(slug, prevRange, canExport)
  const now = comparisonNow(info, wall, [
    canImport ? importCur.dataUpdatedAt : 0,
    canExport ? exportCur.dataUpdatedAt : 0,
  ])
  const prevInfo = previousRange(info, now)
  // Đang chờ xử lý: không theo kỳ.
  const importWaiting = useImportFormSum(slug, 'DRAFT', undefined, canImport)
  const exportWaiting = useExportFormSum(slug, 'PENDING', undefined, canExport)
  // Lô còn hàng hết hạn trước hôm nay (quá hạn) / trước hôm nay + 61 ngày (gồm cả quá hạn).
  const expired = useBatchCount(slug, cutoffs.expired, canStock)
  const expiringBefore = useBatchCount(slug, cutoffs.soon, canStock)
  const inventory = useInventory(canStock ? slug : undefined)

  const overview = useMemo(
    () => (inventory.data ? stockOverview(inventory.data) : null),
    [inventory.data],
  )

  const counts: Counts = {
    importDraft: {
      count: importDraft.data,
      failed: importDraft.isError && importDraft.data === undefined,
    },
    exportDraft: {
      count: exportDraft.data,
      failed: exportDraft.isError && exportDraft.data === undefined,
    },
    exportPending: {
      count: exportPending.data,
      failed: exportPending.isError && exportPending.data === undefined,
    },
    stockLow: {
      count: overview ? overview.out + overview.low : undefined,
      failed: inventory.isError && !inventory.data,
    },
    stockHigh: { count: overview?.high, failed: inventory.isError && !inventory.data },
  }
  const todos = overviewTodos(user, counts)

  // Hạn dùng: quá hạn = đếm(hôm nay); sắp hết hạn = đếm(hôm nay + 61) − quá hạn (cần cả hai số).
  const expiredFailed = expired.isError && expired.data === undefined
  const expiredCount = { count: expired.data, failed: expiredFailed }
  const soonCount = {
    count:
      expired.data !== undefined && expiringBefore.data !== undefined
        ? Math.max(0, expiringBefore.data - expired.data)
        : undefined,
    failed: expiredFailed || (expiringBefore.isError && expiringBefore.data === undefined),
  }
  // Nhóm "Cần chú ý" khi có lô quá hạn / sắp hết hạn HOẶC một số đếm lỗi (không lặng lẽ biến mất → "!");
  // danh sách lô chỉ tải khi đã biết có lô.
  const hasLots = canStock && ((expired.data ?? 0) > 0 || (soonCount.count ?? 0) > 0)
  const attention = hasLots || (canStock && (expiredFailed || soonCount.failed))
  const expiring = useExpiringBatches(hasLots ? slug : undefined, cutoffs.soon)
  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of inventory.data ?? []) map.set(i.materialSlug, i.materialName)
    return map
  }, [inventory.data])
  const firstPage = expiring.data?.pages[0]?.items
  const expiryRows: ExpiryRow[] | undefined = useMemo(
    () =>
      firstPage
        ?.filter((b) => {
          const kind = expiryStatus(b.expiryDate, todayDate).kind
          return kind === 'expired' || kind === 'soon'
        })
        .slice(0, 2)
        .map((batch) => ({ batch, name: names.get(batch.materialSlug) ?? batch.materialSlug })),
    [firstPage, names, todayDate],
  )

  const importFlows = canImport
    ? { current: flowOf(importCur, info, now), previous: flowOf(importPrev, prevInfo) }
    : undefined
  const exportFlows = canExport
    ? { current: flowOf(exportCur, info, now), previous: flowOf(exportPrev, prevInfo) }
    : undefined
  const shortLabel = periodLabel(info, lng, tr).split(' · ')[0]
  const activity: ActivitySeries[] = [
    importFlows ? { key: 'import' as const, flow: importFlows.current } : null,
    exportFlows ? { key: 'export' as const, flow: exportFlows.current } : null,
  ].filter((s) => s !== null)

  const [pulling, setPulling] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const refetchers = [
    canImport && importDraft.refetch,
    canExport && exportDraft.refetch,
    canExport && exportPending.refetch,
    canStock && inventory.refetch,
    canImport && importCur.refetch,
    canImport && importPrev.refetch,
    canImport && importWaiting.refetch,
    canExport && exportCur.refetch,
    canExport && exportPrev.refetch,
    canExport && exportWaiting.refetch,
    canStock && expired.refetch,
    canStock && expiringBefore.refetch,
    hasLots && expiring.refetch,
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

  // Quay lại tab (focus) hoặc app về foreground: làm mới các số đã cũ và render lại (mốc ngày / kỳ mới).
  useRefetchStale(slug, refetchOnReturn)

  const go = useCallback((href: OverviewHref) => router.navigate(href), [router])
  const onTodo = useCallback((todo: Todo) => go(todo.href), [go])
  // Sheet "Hạn dùng" (route sheet gốc) → `push` như các sheet khác; nhóm quá hạn nếu có lô quá hạn.
  const openExpiry = useCallback(
    (focus?: 'expired' | 'soon') =>
      router.push(
        focus ? { pathname: '/expiry-batches', params: { focus } } : expiryHref(expired.data),
      ),
    [router, expired.data],
  )
  // Màn chi tiết đọc kỳ đang chọn từ `usePeriodStore` lúc mở.
  const openDetail = useCallback(
    (metric: Metric | 'activity') =>
      router.push({ pathname: '/overview/[metric]', params: { metric } }),
    [router],
  )

  const weekday = t(`weekdayLong.${todayDate.getDay()}`)
  const dateParams = {
    weekday,
    day: todayDate.getDate(),
    month: todayDate.getMonth() + 1,
    monthName: t(`monthName.${todayDate.getMonth() + 1}`),
  }

  return (
    <Screen edges={['left', 'right']} tone="grouped">
      <ScrollView
        testID="overview-scroll"
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
        <View style={{ gap: 10 }}>
          <Text
            testID="date-line"
            muted
            weight="semibold"
            size={13}
            accessibilityLabel={t('dateLineA11y', dateParams)}
            style={{ paddingHorizontal: 4 }}
          >
            {t('dateLine', dateParams).toUpperCase()}
          </Text>
          <PeriodBar
            period={period}
            label={periodLabel(info, lng, tr)}
            canForward={offset > 0}
            onPeriod={setPeriod}
            onBack={back}
            onForward={forward}
          />
        </View>

        {attention ? (
          <View style={{ gap: 10 }}>
            <GroupTitle title={t('group.attention')} />
            <AttentionCard
              expired={expiredCount}
              soon={soonCount}
              rows={expiryRows}
              today={todayDate}
              onOpen={openExpiry}
            />
          </View>
        ) : null}

        {canImport || canExport ? (
          <View style={{ gap: 10 }}>
            <GroupTitle title={t('group.money')} right={shortLabel} />
            <MoneySection
              imports={importFlows}
              exports={exportFlows}
              pending={{
                imports: canImport ? pendingPart(importWaiting) : undefined,
                exports: canExport ? pendingPart(exportWaiting) : undefined,
              }}
              prevName={compareName(prevInfo, lng, tr)}
              onOpen={openDetail}
            />
          </View>
        ) : null}

        {todos.length > 0 ? <TodoCard todos={todos} onOpen={onTodo} /> : null}

        {canStock && overview && overview.total > 0 ? (
          <View style={{ gap: 10 }}>
            <GroupTitle title={t('group.stock')} />
            <StockSummaryCard counts={overview} onPress={() => go(STOCK_HREF)} />
          </View>
        ) : null}

        {activity.length > 0 ? (
          <View style={{ gap: 10 }}>
            <GroupTitle title={t('group.activity')} right={shortLabel} />
            <ActivitySummaryCard series={activity} onPress={() => openDetail('activity')} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
