import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View, type ScrollViewInstance } from 'react-native'

import {
  expiryCutoffs,
  expiryStatus,
  formatQuantity,
  formatShortDate,
  useBatchCount,
  useExpiringBatches,
  useInventory,
  type MaterialBatch,
} from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useTheme } from '@/shared/theme/useTheme'
import { Button, ListGroup, ListRow, SectionHeader, SheetScaffold, Text } from '@/shared/ui'

type Focus = 'expired' | 'soon'

/**
 * Route `/expiry-batches?focus=expired|soon` — sheet "Hạn dùng" mở từ ô Tổng quan: lô còn hàng đã quá
 * hạn hoặc hết hạn trong 60 ngày tới, hạn gần nhất trước (hai nhóm "Quá hạn" / "Sắp hết hạn"). Danh sách là một
 * truy vấn `expiryBefore = hôm nay + 61` (khoá danh sách, khác khoá số đếm), chia nhóm theo `expiryStatus`.
 * Tiêu đề nhóm kèm số lô lấy từ endpoint đếm — cùng khoá với ô Tổng quan: quá hạn = đếm(hôm nay), sắp hết
 * hạn = đếm(hôm nay + 61) − đếm(hôm nay); thiếu một số đếm thì tiêu đề không kèm số.
 * Chạm một lô → đóng sheet rồi mở chi tiết vật tư. `focus=soon` cuộn tới nhóm "Sắp hết hạn".
 */
export function ExpiryBatchesSheetScreen() {
  const { t, i18n } = useTranslation(['inventory', 'common'])
  const locale: 'vi' | 'en' = i18n.language === 'en' ? 'en' : 'vi'
  const { colors } = useTheme()
  const router = useRouter()
  const closeSheet = useCloseSheet()
  const { focus } = useLocalSearchParams<{ focus?: Focus }>()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const today = useMemo(() => new Date(), [])
  const cutoffs = expiryCutoffs(today)
  const batchesQuery = useExpiringBatches(warehouseSlug, cutoffs.soon)
  const expiredCount = useBatchCount(warehouseSlug, cutoffs.expired, true).data
  const beforeSoonCount = useBatchCount(warehouseSlug, cutoffs.soon, true).data
  const soonCount =
    expiredCount === undefined || beforeSoonCount === undefined
      ? undefined
      : Math.max(0, beforeSoonCount - expiredCount)
  const { data: inventory } = useInventory(warehouseSlug)

  const names = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>()
    for (const i of inventory ?? [])
      map.set(i.materialSlug, { code: i.materialCode, name: i.materialName })
    return map
  }, [inventory])

  const { expired, soon } = useMemo(() => {
    const out = { expired: [] as MaterialBatch[], soon: [] as MaterialBatch[] }
    for (const page of batchesQuery.data?.pages ?? [])
      for (const b of page.items) {
        const kind = expiryStatus(b.expiryDate, today).kind
        if (kind === 'expired') out.expired.push(b)
        else if (kind === 'soon') out.soon.push(b)
      }
    return out
  }, [batchesQuery.data, today])

  const scrollRef = useRef<ScrollViewInstance>(null)
  const scrolled = useRef(false)
  const [soonY, setSoonY] = useState<number | null>(null)
  useEffect(() => {
    if (focus !== 'soon' || scrolled.current || soonY === null) return
    scrolled.current = true
    scrollRef.current?.scrollTo({ y: soonY, animated: false })
  }, [focus, soonY])

  const closed = useRef(false)
  const openBatch = (b: MaterialBatch) => {
    if (closed.current) return
    closed.current = true
    closeSheet()
    router.push({ pathname: '/stock/[materialSlug]', params: { materialSlug: b.materialSlug } })
  }

  const loadMore = () => {
    // Người dùng đã tự cuộn tới cuối: không tự nhảy tới nhóm "Sắp hết hạn" nữa.
    scrolled.current = true
    if (batchesQuery.hasNextPage && !batchesQuery.isFetchingNextPage)
      void batchesQuery.fetchNextPage({ cancelRefetch: false })
  }

  // Tự tải tiếp khi chưa có gì để hiện: các trang đã tải không có dòng nào, hoặc `focus=soon` mà nhóm
  // "Sắp hết hạn" chưa xuất hiện (các trang đầu toàn lô quá hạn).
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = batchesQuery
  const needMore =
    !!batchesQuery.data &&
    (soon.length === 0 || expired.length + soon.length === 0) &&
    (focus === 'soon' || expired.length === 0)
  useEffect(() => {
    if (needMore && hasNextPage && !isFetchingNextPage && !isFetchNextPageError)
      void fetchNextPage({ cancelRefetch: false })
  }, [needMore, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

  const row = (b: MaterialBatch) => {
    const info = names.get(b.materialSlug)
    const name = info?.name ?? b.materialSlug
    const status = expiryStatus(b.expiryDate, today)
    const overdue = status.kind === 'expired'
    const statusText =
      status.kind === 'expired'
        ? t('inventory:expiryOverdue', { count: -(status.days ?? 0) })
        : status.days === 0
          ? t('inventory:batchExpiresToday')
          : t('inventory:batchDaysLeft', { count: status.days ?? 0 })
    const qty = `${formatQuantity(b.remainingQuantity, locale)} ${b.baseUnit?.name ?? ''}`.trim()
    const expiryText = [
      t('inventory:batchExpiry', { date: formatShortDate(b.expiryDate ?? '') }),
      statusText,
    ].join(' · ')
    return (
      <ListRow
        key={b.slug}
        large
        label={name}
        accessibilityLabel={t('inventory:expiryRowLabel', {
          name,
          status: expiryText,
          quantity: qty,
        })}
        subtitle={
          <>
            {info ? (
              <Text code muted size={12} numberOfLines={1}>
                {info.code}
              </Text>
            ) : null}
            <Text
              numeric
              size={12.5}
              weight="medium"
              numberOfLines={1}
              style={{ color: overdue ? colors.destructiveText : colors.mutedForeground }}
            >
              {expiryText}
            </Text>
          </>
        }
        trailing={
          <Text numeric weight="semibold" numberOfLines={1} style={{ maxWidth: '40%' }}>
            {qty}
          </Text>
        }
        onPress={() => openBatch(b)}
      />
    )
  }

  const section = (
    title: string,
    list: MaterialBatch[],
    count: number | undefined,
    onLayoutY?: (y: number) => void,
  ) =>
    list.length === 0 ? null : (
      <View
        key={title}
        testID={onLayoutY ? 'expiry-section-soon' : 'expiry-section-expired'}
        onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}
      >
        <SectionHeader variant="sentence">
          {count === undefined ? title : t('inventory:expirySectionCount', { title, count })}
        </SectionHeader>
        <ListGroup large inset={16}>
          {list.map(row)}
        </ListGroup>
      </View>
    )

  let body
  if (!batchesQuery.data && batchesQuery.isError) {
    body = (
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
        <Text muted style={{ textAlign: 'center' }}>
          {t('inventory:expirySheetError')}
        </Text>
        <Button
          variant="outline"
          loading={batchesQuery.isFetching}
          onPress={() => void batchesQuery.refetch({ cancelRefetch: false })}
        >
          {t('common:retry')}
        </Button>
      </View>
    )
  } else if (!batchesQuery.data) {
    body = (
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <ActivityIndicator
          accessibilityLabel={t('inventory:loading')}
          color={colors.mutedForeground}
        />
      </View>
    )
  } else if (expired.length === 0 && soon.length === 0 && !batchesQuery.hasNextPage) {
    body = (
      <Text muted style={{ textAlign: 'center', paddingVertical: 24 }}>
        {t('inventory:expirySheetEmpty')}
      </Text>
    )
  } else if (expired.length === 0 && soon.length === 0) {
    body = (
      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
        <ActivityIndicator
          accessibilityLabel={t('inventory:loading')}
          color={colors.mutedForeground}
        />
      </View>
    )
  } else {
    body = (
      <>
        {section(t('inventory:expirySectionExpired'), expired, expiredCount)}
        {section(t('inventory:expirySectionSoon'), soon, soonCount, setSoonY)}
        {batchesQuery.isFetchingNextPage ? (
          <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.mutedForeground} />
        ) : null}
      </>
    )
  }

  return (
    <SheetScaffold
      testID="expiry-batches-sheet"
      title={t('inventory:expirySheetTitle')}
      cancelLabel={t('common:cancel')}
      onCancel={closeSheet}
      scrollRef={scrollRef}
      onEndReached={loadMore}
      grouped
    >
      {body}
    </SheetScaffold>
  )
}
