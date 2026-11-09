import { Stack, useRouter, type NativeStackNavigationOptions } from 'expo-router'
import { Layers, SearchX } from '@/shared/ui/icons'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native'

import {
  filterInventory,
  groupByAttention,
  inventoryErrorMessage,
  stockOverview,
  typesOf,
  useInventory,
  type InventoryItem,
} from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { tabHeaderRight, WarehouseTransition } from '@/features/warehouse-picker'
import { useTheme } from '@/shared/theme/useTheme'
import {
  ComposeSectionHeader,
  EmptyState,
  ErrorBanner,
  FirstLoadState,
  Screen,
  SearchField,
  Text,
} from '@/shared/ui'

import {
  AndroidFilterButton,
  AndroidScanButton,
  isFilterActive,
  stockHeaderRightItems,
} from './stock-header'
import { StockOverview } from './StockOverview'
import { STOCK_ROW_INSET, StockRow } from './StockRow'
import { useStockFilter, type StockLevelFilter } from './stock-filter.store'

const SKELETON_ROWS = 6

type StockSection = { key: string; title: string; data: InventoryItem[] }

/** Lọc trên máy: ô tìm kiếm + loại + mức tồn. */
function useFilteredStock(items: InventoryItem[] | undefined) {
  const query = useStockFilter((s) => s.query)
  const level = useStockFilter((s) => s.level)
  const typeSlug = useStockFilter((s) => s.typeSlug)
  // Gõ tìm không chặn khung hình (danh sách 1.500 dòng lọc ở mức ưu tiên thấp). Ô trống (vừa xoá,
  // vừa đổi kho) thì dùng ngay giá trị thật: không bao giờ vẽ một khung với từ khoá cũ.
  const deferredQuery = useDeferredValue(query)
  const effectiveQuery = query === '' ? '' : deferredQuery

  return useMemo(() => {
    const all = items ?? []
    const rows = filterInventory(all, { query: effectiveQuery, level, typeSlug })
    const types = typesOf(all)
    const typeName = types.find((ty) => ty.slug === typeSlug)?.name
    return { rows, types, typeName, level, typeSlug, query: effectiveQuery.trim() }
  }, [items, effectiveQuery, level, typeSlug])
}

function SkeletonRows() {
  const { t } = useTranslation('inventory')
  const { colors, radius } = useTheme()
  const bar = (width: number | `${number}%`, height: number) => ({
    width,
    height,
    borderRadius: 4,
    backgroundColor: colors.fill,
  })
  return (
    <View
      accessible
      accessibilityLabel={t('loading')}
      style={{ backgroundColor: colors.card, borderRadius: radius.groupLarge, overflow: 'hidden' }}
    >
      {Array.from({ length: SKELETON_ROWS }, (_, n) => (
        <View
          key={n}
          testID="stock-skeleton-row"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 68,
            paddingHorizontal: 16,
            borderTopWidth: n > 0 ? StyleSheet.hairlineWidth : 0,
            borderTopColor: colors.separator,
          }}
        >
          <View style={{ flex: 1, gap: 8 }}>
            <View style={bar(`${70 - (n % 3) * 12}%`, 12)} />
            <View style={bar(72, 10)} />
          </View>
          <View style={bar(44, 14)} />
        </View>
      ))}
    </View>
  )
}

/** Đường kẻ giữa hai dòng: nền thẻ, kẻ thẳng lề nội dung của dòng. */
function RowSeparator() {
  const { colors } = useTheme()
  return (
    <View style={{ backgroundColor: colors.card }}>
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          marginLeft: STOCK_ROW_INSET,
          backgroundColor: colors.separator,
        }}
      />
    </View>
  )
}

/** Gợi ý bộ lọc đang bật trên khối danh sách: "Dưới tối thiểu · Sơn · 3 vật tư" + "Xoá lọc". */
function ActiveFilterHint({ text, onClear }: { text: string; onClear: () => void }) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18 }}>
      <Text
        weight="semibold"
        size={13}
        numberOfLines={1}
        style={{ flex: 1, color: colors.fieldLabel }}
      >
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('clearFilter')}
        onPress={onClear}
        style={({ pressed }) => ({
          minHeight: 44,
          paddingHorizontal: 12,
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text weight="medium" size={13} style={{ color: colors.info }}>
          {t('clearFilter')}
        </Text>
      </Pressable>
    </View>
  )
}

/**
 * Tab Tồn kho — danh sách tồn của kho đang chọn (mockup header-apple, hướng B). Header native của
 * Stack lồng (`TabStackLayout`): tiêu đề lớn, nút kho bên trái; màn này thêm ô tìm kiếm native và
 * nút Lọc (menu gốc trên iOS, sheet `/stock-filter` trên Android) bên phải. `FlatList` là con đầu
 * (qua các lớp bọc không gộp) để tiêu đề lớn và ô tìm kiếm thu lại khi cuộn. Tải hết tồn của kho một
 * lần, tìm/lọc trên máy.
 */
export function StockListScreen() {
  const { t, i18n } = useTranslation(['inventory', 'common'])
  const { colors, radius } = useTheme()
  const router = useRouter()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const { data, error, errorUpdateCount, isError, isFetching, refetch } =
    useInventory(warehouseSlug)
  // Lỗi lần đầu rồi bấm Thử lại: react-query đưa query về `pending` và xoá `error` trong lúc gửi lại.
  // Giữ màn lỗi (nút Thử lại bận) thay vì nháy sang khung xương, với câu lỗi gần nhất.
  const [lastError, setLastError] = useState<unknown>(null)
  if (error && error !== lastError) setLastError(error)
  const failedFirstLoad = !data && errorUpdateCount > 0
  const { rows, types, typeName, level, typeSlug, query } = useFilteredStock(data)
  const rawQuery = useStockFilter((s) => s.query)
  const locale = i18n.language === 'en' ? 'en' : 'vi'

  // Loại đang lọc không còn trong kho (vừa làm mới) → về "Tất cả loại" thay vì lọc ra danh sách rỗng.
  useEffect(() => {
    if (data && typeSlug && !data.some((i) => i.typeSlug === typeSlug))
      useStockFilter.getState().setTypeSlug(undefined)
  }, [data, typeSlug])

  const [pulling, setPulling] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  // Không huỷ request đang bay để gửi lại: bấm Thử lại / kéo khi đang tải chỉ chờ request đó.
  const retry = useCallback(() => void refetch({ cancelRefetch: false }), [refetch])
  const onRefresh = useCallback(async () => {
    setPulling(true)
    try {
      await refetch({ cancelRefetch: false })
    } finally {
      if (mounted.current) setPulling(false)
    }
  }, [refetch])

  const openItem = useCallback(
    (item: InventoryItem) =>
      router.push({
        pathname: '/stock/[materialSlug]',
        params: { materialSlug: item.materialSlug },
      }),
    [router],
  )

  const active = isFilterActive(level, typeSlug)
  const headerOptions = useMemo((): NativeStackNavigationOptions => {
    const filter = {
      level,
      typeSlug,
      types,
      t,
      onLevel: (next: StockLevelFilter | undefined) => useStockFilter.getState().setLevel(next),
      onType: (next: string | undefined) => useStockFilter.getState().setTypeSlug(next),
    }
    const scan = {
      label: t('inventory:scanAction'),
      onPress: () => router.navigate('/scan-material'),
    }
    return {
      // Nút kho luôn cuối (ngoài cùng bên phải): [Quét mã, Lọc, kho].
      ...tabHeaderRight({
        ios: stockHeaderRightItems({ ...filter, scan }),
        android: (
          <>
            <AndroidScanButton label={scan.label} onPress={scan.onPress} />
            <AndroidFilterButton
              active={active}
              label={active ? t('inventory:filterOn') : t('inventory:filter')}
              onPress={() => router.navigate('/stock-filter')}
            />
          </>
        ),
      }),
    }
  }, [level, typeSlug, types, t, active, router])

  // Hai nhóm (hướng C): "Cần chú ý" (hết → dưới min → vượt max) rồi "Bình thường"; nhóm rỗng ẩn.
  const sections = useMemo((): StockSection[] => {
    const { attention, normal } = groupByAttention(rows)
    const all: StockSection[] = [
      {
        key: 'attention',
        title: t('inventory:groupAttention', { count: attention.length }),
        data: attention,
      },
      { key: 'normal', title: t('inventory:groupNormal', { count: normal.length }), data: normal },
    ]
    return all.filter((sec) => sec.data.length > 0)
  }, [rows, t])
  // Tổng quan đếm trên CẢ KHO, không theo tìm kiếm / lọc.
  const overview = useMemo(() => (data && data.length > 0 ? stockOverview(data) : null), [data])

  const renderItem = useCallback(
    ({ item, index, section }: { item: InventoryItem; index: number; section: StockSection }) => {
      const last = section.data.length - 1
      return (
        <View
          style={{
            overflow: 'hidden',
            borderTopLeftRadius: index === 0 ? radius.groupLarge : 0,
            borderTopRightRadius: index === 0 ? radius.groupLarge : 0,
            borderBottomLeftRadius: index === last ? radius.groupLarge : 0,
            borderBottomRightRadius: index === last ? radius.groupLarge : 0,
          }}
        >
          <StockRow item={item} locale={locale} onPress={openItem} />
        </View>
      )
    },
    [radius.groupLarge, locale, openItem],
  )
  const firstKey = sections[0]?.key
  const renderSectionHeader = useCallback(
    ({ section }: { section: StockSection }) => (
      // Nhóm đầu không đệm; nhóm sau đệm 8 để tiêu đề không dính đáy thẻ nhóm trên.
      <View style={{ paddingTop: section.key === firstKey ? 0 : 8 }}>
        <ComposeSectionHeader title={section.title} />
      </View>
    ),
    [firstKey],
  )

  const empty = failedFirstLoad ? (
    <FirstLoadState
      failed
      errorTitle={t('inventory:loadError')}
      errorMessage={inventoryErrorMessage(error ?? lastError, t)}
      loadingLabel={t('inventory:loading')}
      fetching={isFetching}
      onRetry={retry}
    />
  ) : !data ? (
    <SkeletonRows />
  ) : data.length === 0 ? (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={Layers}
        title={t('inventory:empty')}
        description={t('inventory:emptyDescription')}
      />
    </View>
  ) : (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={SearchX}
        title={query ? t('inventory:noMatch', { query }) : t('inventory:emptyFiltered')}
        description={
          query ? t('inventory:noMatchDescription') : t('inventory:emptyFilteredDescription')
        }
      />
    </View>
  )

  const levelName =
    level === 'low'
      ? t('inventory:alertBelow')
      : level === 'high'
        ? t('inventory:alertAbove')
        : undefined
  const hint = [levelName, typeName, t('inventory:itemCount', { count: rows.length })]
    .filter(Boolean)
    .join(' · ')
  const showBanner = isError && !!data
  const header = (
    <View style={{ gap: 12, paddingBottom: 4 }}>
      <SearchField
        value={rawQuery}
        onChangeText={(text) => useStockFilter.getState().setQuery(text)}
        placeholder={t('inventory:searchPlaceholder')}
        clearLabel={t('common:clearSearch')}
      />
      {showBanner ? (
        <ErrorBanner
          message={t('inventory:refreshError')}
          retryLabel={t('common:retry')}
          busy={isFetching}
          onRetry={retry}
        />
      ) : null}
      {overview ? <StockOverview counts={overview} /> : null}
      {active && data ? (
        <ActiveFilterHint text={hint} onClear={() => useStockFilter.getState().clearFilters()} />
      ) : null}
    </View>
  )

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      <Stack.Screen options={headerOptions} />
      {/* Đổi kho → mờ rồi hiện lại. Không gộp lớp bọc (collapsable) để SectionList vẫn là "con đầu". */}
      <WarehouseTransition style={{ flex: 1 }}>
        <SectionList
          testID="stock-list"
          sections={sections}
          keyExtractor={(item) => item.slug}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={RowSeparator}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            flexGrow: 1,
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
        />
      </WarehouseTransition>
    </Screen>
  )
}
