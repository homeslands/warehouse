import { Stack, useRouter, type NativeStackNavigationOptions } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, Platform, RefreshControl, View } from 'react-native'

import {
  flattenMaterialPages,
  materialAbilities,
  toMaterialSearch,
  useMaterialsInfinite,
  type Material,
} from '@/entities/material'
import { useAuthStore } from '@/entities/session'
import { AndroidFilterButton, filterHeaderItem } from '@/features/list-filters'
import { errorMessage } from '@/shared/api/error-message'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTheme } from '@/shared/theme/useTheme'
import {
  addHeaderItem,
  AndroidAddButton,
  AndroidScanButton,
  Button,
  EmptyState,
  ErrorBanner,
  FirstLoadState,
  Screen,
  SearchField,
  Text,
} from '@/shared/ui'
import { CatalogRow } from '@/shared/ui/catalog'
import { Package, SearchX, ShieldOff } from '@/shared/ui/icons'

import { useMaterialFilter } from './filter-store'

/**
 * Danh sách Vật tư (push trong Stack tab Tài khoản). Cuộn tải dần (`useMaterialsInfinite`, trang 30),
 * tìm theo tên / mã trên server (debounce), lọc theo loại qua sheet `/material-filter`. Header nhỏ:
 * nút Quét mã (`/scan-catalog-material`: khớp mã → mở chi tiết, không khớp → điền mã vào ô tìm) + nút
 * Lọc (tô accent khi đang lọc) + nút + khi được tạo. Không có nút kho: danh mục dùng chung.
 */
export function MaterialListScreen() {
  const { t } = useTranslation(['catalog', 'common'])
  const { colors } = useTheme()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const abilities = materialAbilities(user)
  const type = useMaterialFilter((s) => s.type)
  const [query, setQuery] = useState('')
  // Mã quét được mà không khớp vật tư nào (`/scan-catalog-material`, mở NGAY trên màn này): điền vào ô
  // tìm một lần rồi xoá.
  useEffect(
    () =>
      useMaterialFilter.subscribe((state) => {
        if (state.scannedQuery === null) return
        setQuery(state.scannedQuery)
        useMaterialFilter.getState().setScannedQuery(null)
      }),
    [],
  )
  const debounced = useDebounced(query).trim()
  const search = toMaterialSearch(debounced)

  const list = useMaterialsInfinite({
    query: debounced,
    typeSlug: type?.slug,
    enabled: abilities.read,
  })
  const {
    data,
    error,
    errorUpdateCount,
    isError,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    refetch,
    fetchNextPage,
  } = list
  const items = useMemo(() => (data ? flattenMaterialPages(data.pages) : []), [data])

  const [lastError, setLastError] = useState<unknown>(null)
  if (error && error !== lastError) setLastError(error)
  const failedFirstLoad = !data && errorUpdateCount > 0

  const [pulling, setPulling] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const retry = useCallback(() => void refetch({ cancelRefetch: false }), [refetch])
  const onRefresh = useCallback(async () => {
    setPulling(true)
    try {
      await refetch({ cancelRefetch: false })
    } finally {
      if (mounted.current) setPulling(false)
    }
  }, [refetch])
  const loadMore = useCallback(() => void fetchNextPage({ cancelRefetch: false }), [fetchNextPage])
  const onEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) return
    loadMore()
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, loadMore])

  const canCreate = abilities.read && abilities.create
  const filterActive = type !== null
  const headerOptions = useMemo((): NativeStackNavigationOptions => {
    const filterButton = {
      active: filterActive,
      label: t('catalog:material.filter'),
      activeLabel: t('catalog:material.filterOn'),
      onPress: () => router.push('/material-filter'),
    }
    const addLabel = t('catalog:material.create')
    const add = () => router.push('/material-form')
    const scanLabel = t('catalog:material.scanSearch')
    const scan = () => router.push('/scan-catalog-material')
    if (!abilities.read) return { title: t('catalog:material.listTitle') }
    return {
      title: t('catalog:material.listTitle'),
      ...(Platform.OS === 'ios'
        ? {
            unstable_headerRightItems: () => [
              {
                type: 'button' as const,
                label: scanLabel,
                accessibilityLabel: scanLabel,
                icon: { type: 'sfSymbol' as const, name: 'barcode.viewfinder' as const },
                onPress: scan,
              },
              filterHeaderItem(filterButton),
              ...(canCreate ? [addHeaderItem({ label: addLabel, onPress: add })] : []),
            ],
          }
        : {
            headerRight: () => (
              <View style={{ flexDirection: 'row' }}>
                <AndroidScanButton label={scanLabel} onPress={scan} />
                <AndroidFilterButton {...filterButton} />
                {canCreate ? <AndroidAddButton label={addLabel} onPress={add} /> : null}
              </View>
            ),
          }),
    }
  }, [t, router, abilities.read, canCreate, filterActive])

  const openRow = useCallback((slug: string) => router.push(`/account/materials/${slug}`), [router])

  const renderItem = useCallback(
    ({ item, index }: { item: Material; index: number }) => {
      return (
        <CatalogRow
          kind="material"
          first={index === 0}
          slug={item.slug}
          code={item.code}
          name={item.name}
          description={item.type.name}
          endLabel={item.baseUnit?.code}
          onPress={openRow}
        />
      )
    },
    [openRow],
  )

  if (!abilities.read) {
    return (
      <Screen edges={['left', 'right']} tone="plain" collapsable={false}>
        <Stack.Screen options={headerOptions} />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon={ShieldOff} title={t('catalog:noAccess')} description="" />
        </View>
      </Screen>
    )
  }

  const filtered = filterActive || debounced !== ''
  const empty =
    search.kind === 'invalid' ? (
      <View style={{ paddingTop: 48 }}>
        <EmptyState icon={SearchX} title={t('catalog:material.searchInvalid')} description="" />
      </View>
    ) : !data ? (
      <FirstLoadState
        failed={failedFirstLoad}
        errorTitle={t('catalog:loadError')}
        errorMessage={errorMessage(error ?? lastError, t)}
        loadingLabel={t('catalog:loading')}
        fetching={isFetching}
        onRetry={retry}
      />
    ) : filtered ? (
      <View style={{ paddingTop: 48 }}>
        <EmptyState icon={SearchX} title={t('catalog:noResults')} description="" />
      </View>
    ) : (
      <View style={{ paddingTop: 48 }}>
        <EmptyState
          icon={Package}
          title={t('catalog:material.empty')}
          description={canCreate ? t('catalog:material.emptyHint') : ''}
        />
      </View>
    )

  const footer = isFetchingNextPage ? (
    <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.mutedForeground} />
  ) : isFetchNextPageError ? (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 16 }}>
      <Text muted size={13}>
        {t('catalog:material.loadMoreError')}
      </Text>
      <Button variant="outline" onPress={loadMore}>
        {t('common:retry')}
      </Button>
    </View>
  ) : undefined

  return (
    <Screen edges={['left', 'right']} tone="plain" collapsable={false}>
      <Stack.Screen options={headerOptions} />
      <FlatList
        testID="material-list"
        data={search.kind === 'invalid' ? [] : items}
        keyExtractor={(m) => m.slug}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 12 }}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={t('catalog:searchPlaceholder')}
              clearLabel={t('common:clearSearch')}
            />
            {isError && !!data && !isFetchNextPageError ? (
              <ErrorBanner
                message={t('catalog:loadError')}
                retryLabel={t('common:retry')}
                busy={isFetching}
                onRetry={retry}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
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
    </Screen>
  )
}
