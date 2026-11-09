import { Stack, useLocalSearchParams } from 'expo-router'
import { PackageX } from '@/shared/ui/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RefreshControl,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'

import {
  inventoryErrorMessage,
  useInventoryHistory,
  useInventoryItem,
  useMaterialBatches,
} from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { WarehouseTransition } from '@/features/warehouse-picker'
import { useLeaveOnWarehouseChange } from '@/shared/lib/useLeaveOnWarehouseChange'
import { useTheme } from '@/shared/theme/useTheme'
import { EmptyState, ErrorBanner, FirstLoadState, Screen, Text } from '@/shared/ui'

import { BatchList } from './BatchList'
import { DetailTabs, type DetailTab } from './DetailTabs'
import { HistoryList } from './HistoryList'
import { StockHero } from './StockHero'

/** Còn cách cuối nội dung chừng này (pt) thì tải trang lịch sử sau. */
const LOAD_MORE_THRESHOLD = 400

/**
 * Chi tiết một vật tư trong kho đang chọn (mockup phone 2), route `/stock/[materialSlug]` trong Stack
 * lồng của tab Tồn kho (header native: nút quay lại "Tồn kho"). Số tồn lấy từ cache danh sách
 * (`useInventoryItem`), lô từ `useMaterialBatches`, lịch sử từ `useInventoryHistory` (chỉ tải khi đã
 * mở tab Lịch sử; cuộn gần cuối `ScrollView` thì tải trang sau). Kéo xuống làm mới mọi phần đã tải.
 * `ScrollView` là con đầu (lớp bọc không gộp) để header native tự chừa chỗ.
 */
export function StockDetailScreen() {
  const { t, i18n } = useTranslation(['inventory', 'common'])
  const { colors } = useTheme()
  const { materialSlug } = useLocalSearchParams<{ materialSlug: string }>()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  useLeaveOnWarehouseChange(warehouseSlug)
  const locale = i18n.language === 'en' ? 'en' : 'vi'

  const itemQuery = useInventoryItem(warehouseSlug, materialSlug)
  const batchesQuery = useMaterialBatches(warehouseSlug, materialSlug)
  const item = itemQuery.data
  // Như danh sách: bấm Thử lại thì react-query xoá `error` khi gửi lại — giữ câu lỗi gần nhất.
  const [lastError, setLastError] = useState<unknown>(null)
  if (itemQuery.error && itemQuery.error !== lastError) setLastError(itemQuery.error)
  const failedFirstLoad = !item && itemQuery.errorUpdateCount > 0 && !itemQuery.isSuccess

  const [tab, setTab] = useState<DetailTab>('batches')
  // Lịch sử chỉ tải khi người dùng mở tab lần đầu; mở rồi thì giữ (quay lại tab không tải lại).
  const [historyOpened, setHistoryOpened] = useState(false)
  const historyQuery = useInventoryHistory(warehouseSlug, historyOpened ? materialSlug : undefined)
  // Phân trang offset theo `createdAt`: biến động mới chen vào giữa hai lần tải (hoặc nhiều dòng cùng
  // thời điểm) đẩy dòng cũ sang trang sau → bỏ dòng trùng `slug`, giữ lần đầu.
  const historyPages = historyQuery.data?.pages
  const historyRows = useMemo(() => {
    if (!historyPages) return undefined
    const seen = new Set<string>()
    return historyPages
      .flatMap((p) => p.items)
      .filter((r) => !seen.has(r.slug) && !!seen.add(r.slug))
  }, [historyPages])
  const onTab = useCallback((next: DetailTab) => {
    setTab(next)
    if (next === 'history') setHistoryOpened(true)
  }, [])
  const [pulling, setPulling] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const { refetch: refetchItem } = itemQuery
  const { refetch: refetchBatches } = batchesQuery
  const { refetch: refetchHistory, fetchNextPage, hasNextPage } = historyQuery
  const onRefresh = useCallback(async () => {
    setPulling(true)
    try {
      await Promise.all([
        refetchItem({ cancelRefetch: false }),
        refetchBatches({ cancelRefetch: false }),
        historyOpened ? refetchHistory({ cancelRefetch: false }) : null,
      ])
    } finally {
      if (mounted.current) setPulling(false)
    }
  }, [refetchItem, refetchBatches, refetchHistory, historyOpened])

  // Tải trang lịch sử sau khi cuộn gần cuối. Khoá đồng bộ bằng ref: hai sự kiện cuộn liền nhau trước
  // khi `isFetchingNextPage` kịp đổi chỉ gửi một request. Tải trang sau lỗi → chờ người dùng bấm Thử lại.
  const loadingMore = useRef(false)
  const canLoadMore =
    tab === 'history' &&
    hasNextPage &&
    !historyQuery.isFetchingNextPage &&
    !historyQuery.isFetchNextPageError
  const loadMore = useCallback(() => {
    if (loadingMore.current) return
    loadingMore.current = true
    void fetchNextPage({ cancelRefetch: false }).finally(() => {
      loadingMore.current = false
    })
  }, [fetchNextPage])
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!canLoadMore) return
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - LOAD_MORE_THRESHOLD)
      loadMore()
  }

  // Làm mới lỗi khi đã có dữ liệu (số tồn, lô hoặc lịch sử): giữ dữ liệu cũ, báo lỗi nhẹ phía trên
  // (Review Focus 5).
  const refreshFailed =
    itemQuery.isRefetchError || batchesQuery.isRefetchError || historyQuery.isRefetchError
  const retryRefresh = () => {
    if (itemQuery.isRefetchError) void refetchItem({ cancelRefetch: false })
    if (batchesQuery.isRefetchError) void refetchBatches({ cancelRefetch: false })
    if (historyQuery.isRefetchError) void refetchHistory({ cancelRefetch: false })
  }

  const today = new Date()

  const body = item ? (
    <>
      {refreshFailed ? (
        <ErrorBanner
          message={t('inventory:detailRefreshError')}
          retryLabel={t('common:retry')}
          busy={itemQuery.isFetching || batchesQuery.isFetching || historyQuery.isFetching}
          onRetry={retryRefresh}
        />
      ) : null}
      <View style={{ gap: 2, paddingHorizontal: 4 }}>
        <Text muted size={12.5} numberOfLines={1}>
          <Text code muted size={12.5}>
            {item.materialCode}
          </Text>
          {item.typeName ? ` · ${item.typeName}` : null}
        </Text>
        <Text
          accessibilityRole="header"
          weight="bold"
          size={20}
          numberOfLines={2}
          style={{ lineHeight: 25 }}
        >
          {item.materialName}
        </Text>
      </View>
      <StockHero item={item} locale={locale} compact={tab === 'history'} />
      <DetailTabs value={tab} onChange={onTab} batchCount={batchesQuery.data?.length} />
      {tab === 'batches' ? (
        <BatchList
          batches={batchesQuery.data}
          failed={batchesQuery.errorUpdateCount > 0 && !batchesQuery.data}
          retrying={batchesQuery.isFetching}
          onRetry={() => void refetchBatches({ cancelRefetch: false })}
          locale={locale}
          today={today}
        />
      ) : (
        <HistoryList
          rows={historyRows}
          failed={historyQuery.errorUpdateCount > 0 && !historyRows}
          retrying={historyQuery.isFetching && !historyQuery.isFetchingNextPage}
          onRetry={() => void refetchHistory({ cancelRefetch: false })}
          loadingMore={historyQuery.isFetchingNextPage}
          loadMoreFailed={historyQuery.isFetchNextPageError}
          onRetryMore={loadMore}
          locale={locale}
          today={today}
        />
      )}
    </>
  ) : failedFirstLoad || itemQuery.isPending ? (
    <FirstLoadState
      failed={failedFirstLoad}
      errorTitle={t('inventory:loadError')}
      errorMessage={inventoryErrorMessage(itemQuery.error ?? lastError, t)}
      loadingLabel={t('inventory:loading')}
      fetching={itemQuery.isFetching}
      onRetry={() => void refetchItem({ cancelRefetch: false })}
    />
  ) : (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={PackageX}
        title={t('inventory:notInWarehouse')}
        description={t('inventory:notInWarehouseDescription')}
      />
    </View>
  )

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      {/* Header chuẩn của màn con: tiêu đề nhỏ giữa là mã vật tư (tên đầy đủ nằm trong nội dung). */}
      <Stack.Screen options={{ title: item?.materialCode ?? '' }} />
      {/* Không gộp lớp bọc (collapsable) để ScrollView vẫn là "con đầu" của màn. */}
      <WarehouseTransition style={{ flex: 1 }}>
        <ScrollView
          testID="stock-detail-scroll"
          contentInsetAdjustmentBehavior="automatic"
          onScroll={onScroll}
          scrollEventThrottle={100}
          contentContainerStyle={{
            flexGrow: 1,
            gap: 18,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 32,
          }}
          refreshControl={
            <RefreshControl
              refreshing={pulling}
              onRefresh={() => void onRefresh()}
              tintColor={colors.mutedForeground}
            />
          }
        >
          {body}
        </ScrollView>
      </WarehouseTransition>
    </Screen>
  )
}
