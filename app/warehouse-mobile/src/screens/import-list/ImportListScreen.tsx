import { Stack, useRouter, type NativeStackNavigationOptions } from 'expo-router'
import { CloudOff, FunnelX, PackagePlus, SearchX } from '@/shared/ui/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, RefreshControl, SectionList, View } from 'react-native'

import {
  canCreateImportForm,
  useImportForms,
  importFormErrorMessage,
  type ImportForm,
  type ImportFormAccess,
  type ImportFormSearchField,
} from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  AndroidFilterButton,
  FilterSummary,
  filterHeaderItem,
  useActiveFilterLabels,
  useListViewer,
} from '@/features/list-filters'
import { tabHeaderRight, WarehouseTransition } from '@/features/warehouse-picker'
import { groupFormsByDay, type DayGroup } from '@/shared/lib/group-by-day'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useTheme } from '@/shared/theme/useTheme'
import {
  Button,
  EmptyState,
  ErrorBanner,
  FLOATING_BUTTON_SPACE,
  FloatingCreateButton,
  FormListSkeleton,
  FormRowSeparator,
  Screen,
  SearchField,
  SectionHeader,
  SegmentedControl,
} from '@/shared/ui'

import { IMPORT_ROW_INSET, ImportFormRow } from './ImportFormRow'
import { useImportListFilter, type ImportStatusFilter } from './import-list.store'
import { listQueryFilters } from './list-filters'

const RowSeparator = () => <FormRowSeparator inset={IMPORT_ROW_INSET} />
const STATUS_FILTERS: ImportStatusFilter[] = ['ALL', 'DRAFT', 'CONFIRMED', 'CANCELLED']
const SEARCH_FIELDS: ImportFormSearchField[] = ['code', 'invoiceCode', 'purchaseOrder']

/**
 * Tab Nhập — danh sách phiếu nhập của kho đang chọn (hướng B). Header native của Stack lồng
 * (`TabStackLayout`): tiêu đề lớn + [Lọc, kho] bên phải (`tabHeaderRight`; Lọc mở sheet `/import-filter`,
 * icon đặc khi đang lọc); ô tìm kiếm LUÔN hiện: `SearchField` ở đầu danh sách trên CẢ HAI nền
 * (không dùng ô native của header — nháy khi đổi tab trên iOS 26). "Tạo phiếu" là nút "+" nổi (Liquid Glass) trên thanh tab.
 * Danh sách gom theo NGÀY tạo (giờ máy), mỗi ngày một khối bo 26 (`SectionList` ảo hoá). Đầu danh
 * sách: trạng thái; trường tìm (chỉ khi ô có chữ — API chỉ lọc tiền tố từng trường một); dòng tóm tắt
 * bộ lọc đang có hiệu lực (`FilterSummary`, chỉ khi đang lọc).
 */
export function ImportListScreen() {
  const { t, i18n } = useTranslation(['importForms', 'common'])
  const { colors, radius } = useTheme()
  const router = useRouter()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const user = useAuthStore((s) => s.user)
  const status = useImportListFilter((s) => s.status)
  const field = useImportListFilter((s) => s.field)
  const query = useImportListFilter((s) => s.query)
  const time = useImportListFilter((s) => s.time)
  const requester = useImportListFilter((s) => s.requester)
  const approver = useImportListFilter((s) => s.approver)
  const debounced = useDebounced(query).trim()
  const locale = i18n.language === 'en' ? 'en' : 'vi'

  const access = useMemo<ImportFormAccess | null>(
    () => (user ? { can: (c) => can(user, c), userSlug: user.userSlug ?? null } : null),
    [user],
  )
  const allowCreate = !!access && canCreateImportForm(access)
  const viewer = useListViewer()
  const filterLabels = useActiveFilterLabels(viewer, { time, requester, approver })
  const chipFiltered = filterLabels.active
  const filterState = { status, field, query: debounced, time, requester, approver }

  // Mốc thời gian nhanh tính theo giờ máy lúc dựng query (store chỉ giữ ID mốc).
  const list = useImportForms(warehouseSlug, listQueryFilters(filterState, viewer, new Date()))
  const { data, error, errorUpdateCount, isError, isFetching, isFetchingNextPage, hasNextPage } =
    list
  const { refetch, fetchNextPage } = list
  const forms = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  // Nhóm theo ngày tạo (giờ máy); trang sau có thể tiếp một ngày của trang trước → gộp liền nhau.
  const sections = useMemo(
    () =>
      groupFormsByDay(forms, new Date(), locale, {
        today: t('importForms:list.today'),
        yesterday: t('importForms:list.yesterday'),
      }),
    [forms, locale, t],
  )

  // Lỗi lần đầu rồi Thử lại: query về `pending` và xoá `error` — giữ màn lỗi thay vì nháy khung xương.
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
  const onEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || isError) return
    void fetchNextPage({ cancelRefetch: false })
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage])

  const openForm = useCallback(
    (f: ImportForm) =>
      router.push({ pathname: '/import/[formSlug]', params: { formSlug: f.slug } }),
    [router],
  )

  /**
   * Mỗi (người dùng, kho) chỉ một bản nháp phiếu mới: bước 1 (modal `/import-form/new/info`) tự mở lại
   * bản nháp đó nếu có (trong bộ nhớ hoặc trên máy), không thì dựng bản trắng. `navigate` (không `push`):
   * bấm hai lần liền vẫn chỉ một modal.
   */
  const openCreate = useCallback(() => router.navigate('/import-form/new/info'), [router])

  const openFilter = useCallback(() => router.navigate('/import-filter'), [router])
  const headerOptions = useMemo((): NativeStackNavigationOptions => {
    const filterButton = {
      active: chipFiltered,
      label: t('importForms:list.filters.button'),
      activeLabel: t('importForms:list.filters.buttonOn'),
      onPress: openFilter,
    }
    // Thứ tự luôn [Lọc, kho] qua `tabHeaderRight` (không tự đặt mục bên phải của màn đầu tab).
    const right = tabHeaderRight({
      ios: [filterHeaderItem(filterButton)],
      android: <AndroidFilterButton {...filterButton} />,
    })
    return right
  }, [t, chipFiltered, openFilter])

  const statusItems = STATUS_FILTERS.map((s) => ({
    value: s,
    label: t(`importForms:list.filter.${s}`),
  }))
  const fieldItems = SEARCH_FIELDS.map((f) => ({ value: f, label: t(`importForms:field.${f}`) }))

  const header = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <SearchField
        value={query}
        onChangeText={(text) => useImportListFilter.getState().setQuery(text)}
        placeholder={t('importForms:list.searchPlaceholder')}
        clearLabel={t('common:clearSearch')}
      />
      {isError && !!data ? (
        <ErrorBanner
          message={t('importForms:list.refreshError')}
          retryLabel={t('common:retry')}
          busy={isFetching}
          onRetry={retry}
        />
      ) : null}
      <SegmentedControl
        testID="import-status"
        items={statusItems}
        value={status}
        onChange={(s) => useImportListFilter.getState().setStatus(s)}
      />
      {query.trim() !== '' ? (
        <SegmentedControl
          testID="import-field"
          items={fieldItems}
          value={field}
          onChange={(f) => useImportListFilter.getState().setField(f)}
        />
      ) : null}
      {chipFiltered ? <FilterSummary store={useImportListFilter} onOpen={openFilter} /> : null}
    </View>
  )

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: ImportForm
      index: number
      section: DayGroup<ImportForm>
    }) => {
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
          <ImportFormRow form={item} locale={locale} onPress={openForm} />
        </View>
      )
    },
    [radius.groupLarge, locale, openForm],
  )
  const firstKey = sections[0]?.key
  const renderSectionHeader = useCallback(
    ({ section }: { section: DayGroup<ImportForm> }) => (
      <View style={{ paddingTop: section.key === firstKey ? 4 : 24 }}>
        <SectionHeader variant="sentence">{section.title}</SectionHeader>
      </View>
    ),
    [firstKey],
  )

  const empty = failedFirstLoad ? (
    <View style={{ paddingTop: 48, gap: 18 }}>
      <EmptyState
        icon={CloudOff}
        title={t('importForms:list.loadError')}
        description={importFormErrorMessage(error ?? lastError, t)}
      />
      <Button
        variant="outline"
        loading={isFetching}
        style={{ alignSelf: 'center' }}
        onPress={retry}
      >
        {t('common:retry')}
      </Button>
    </View>
  ) : !data ? (
    <FormListSkeleton label={t('importForms:list.loading')} rowTestID="import-skeleton-row" />
  ) : chipFiltered ? (
    // Có bộ lọc chip thì ưu tiên câu này (có lối ra "Xoá lọc"), kể cả khi đang tìm kiếm.
    <View style={{ paddingTop: 48, gap: 18 }}>
      <EmptyState
        icon={FunnelX}
        title={t('importForms:list.emptyFiltered')}
        description={t('importForms:list.emptyFilteredDescription')}
      />
      <Button
        variant="outline"
        style={{ alignSelf: 'center' }}
        onPress={() => useImportListFilter.getState().clearChips()}
      >
        {t('importForms:list.filters.clear')}
      </Button>
    </View>
  ) : debounced ? (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={SearchX}
        title={t('importForms:list.noMatch')}
        description={t('importForms:list.noMatchDescription')}
      />
    </View>
  ) : (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={PackagePlus}
        title={t('importForms:list.empty')}
        description={t('importForms:list.emptyDescription')}
      />
    </View>
  )

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      <Stack.Screen options={headerOptions} />
      <WarehouseTransition style={{ flex: 1 }}>
        <SectionList
          testID="import-list"
          sections={sections}
          keyExtractor={(f) => f.slug}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={RowSeparator}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={colors.mutedForeground} />
            ) : undefined
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: allowCreate ? FLOATING_BUTTON_SPACE : 32,
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
      {allowCreate ? (
        <FloatingCreateButton label={t('importForms:list.createForm')} onPress={openCreate} />
      ) : null}
    </Screen>
  )
}
