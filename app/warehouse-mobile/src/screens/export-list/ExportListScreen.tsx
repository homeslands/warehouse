import { Stack, useRouter, type NativeStackNavigationOptions } from 'expo-router'
import { CloudOff, FunnelX, PackageMinus, SearchX } from '@/shared/ui/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, RefreshControl, SectionList, View } from 'react-native'

import {
  canCreateExportForm,
  exportFormErrorMessage,
  useExportForms,
  type ExportForm,
  type ExportFormAccess,
  type ExportFormFilters,
  type ExportFormSearchField,
} from '@/entities/export-form'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  AndroidFilterButton,
  FilterSummary,
  filterHeaderItem,
  useActiveFilterLabels,
  listChipQuery,
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

import { EXPORT_ROW_INSET, ExportFormRow } from './ExportFormRow'
import {
  defaultExportStatus,
  useExportListFilter,
  type ExportStatusFilter,
} from './export-list.store'

const RowSeparator = () => <FormRowSeparator inset={EXPORT_ROW_INSET} />
const STATUS_FILTERS: ExportStatusFilter[] = ['ALL', 'DRAFT', 'PENDING', 'CONFIRMED', 'CANCELLED']
const SEARCH_FIELDS: ExportFormSearchField[] = ['code', 'invoiceCode', 'purchaseOrder']

/**
 * Tab Xuất — danh sách phiếu xuất của kho đang chọn (cùng dáng tab Nhập). Header native của Stack lồng
 * (`TabStackLayout`): tiêu đề lớn + [Lọc, kho] bên phải (`tabHeaderRight`; Lọc mở sheet `/export-filter`,
 * icon đặc khi đang lọc, kể cả chỉ lọc Loại); ô tìm kiếm LUÔN hiện: `SearchField` ở đầu danh sách trên CẢ HAI nền
 * (không dùng ô native của header — nháy khi đổi tab trên iOS 26). "Tạo phiếu" là nút "+" nổi (Liquid Glass) trên thanh tab, chỉ khi có EXPORT_FORM_CREATE.
 * Trạng thái mặc định theo quyền (`defaultExportStatus`) tới khi người dùng chọn; "Loại" là bộ lọc riêng của tab
 * (nằm trong store, hiện trong dòng tóm tắt).
 * Danh sách gom theo NGÀY tạo (giờ máy), mỗi ngày một khối bo 26 (`SectionList` ảo hoá). Đầu danh
 * sách: trạng thái; trường tìm (chỉ khi ô có chữ — API chỉ lọc tiền tố từng trường một); dòng tóm tắt
 * bộ lọc đang có hiệu lực (`FilterSummary`, chỉ khi đang lọc).
 */
export function ExportListScreen() {
  const { t, i18n } = useTranslation(['exportForms', 'common'])
  const { colors, radius } = useTheme()
  const router = useRouter()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const user = useAuthStore((s) => s.user)
  const storedStatus = useExportListFilter((s) => s.status)
  const type = useExportListFilter((s) => s.type)
  const field = useExportListFilter((s) => s.field)
  const query = useExportListFilter((s) => s.query)
  const time = useExportListFilter((s) => s.time)
  const requester = useExportListFilter((s) => s.requester)
  const approver = useExportListFilter((s) => s.approver)
  const debounced = useDebounced(query).trim()
  const locale = i18n.language === 'en' ? 'en' : 'vi'

  const access = useMemo<ExportFormAccess | null>(
    () => (user ? { can: (c) => can(user, c), userSlug: user.userSlug ?? null } : null),
    [user],
  )
  const allowCreate = !!access && canCreateExportForm(access)
  const viewer = useListViewer()
  const filterLabels = useActiveFilterLabels(viewer, { time, requester, approver })
  // Có bộ lọc nào đang áp dụng (thời gian / người / Loại): nút Lọc đặc, hiện dòng tóm tắt, rỗng → Xoá lọc.
  const chipFiltered = filterLabels.active || type !== null
  const extraLabels = type ? [t(`exportForms:type.${type}`)] : []
  const clearType = useCallback(() => useExportListFilter.getState().setType(null), [])
  // Chưa chọn thì theo quyền: người duyệt thấy phiếu Chờ duyệt, người lập thấy Nháp.
  const status: ExportStatusFilter =
    storedStatus ?? defaultExportStatus(!!user && can(user, 'EXPORT_FORM_CONFIRM'))

  // Mốc thời gian nhanh tính theo giờ máy lúc dựng query (store chỉ giữ ID mốc).
  const filters: ExportFormFilters = {
    ...(status === 'ALL' ? {} : { status }),
    ...(type ? { type } : {}),
    ...(debounced ? { field, query: debounced } : {}),
    ...listChipQuery({ time, requester, approver }, viewer, new Date()),
  }
  const list = useExportForms(warehouseSlug, filters)
  const { data, error, errorUpdateCount, isError, isFetching, isFetchingNextPage, hasNextPage } =
    list
  const { refetch, fetchNextPage } = list
  const forms = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  // Nhóm theo ngày tạo (giờ máy); trang sau có thể tiếp một ngày của trang trước → gộp liền nhau.
  const sections = useMemo(
    () =>
      groupFormsByDay(forms, new Date(), locale, {
        today: t('exportForms:list.today'),
        yesterday: t('exportForms:list.yesterday'),
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
    (f: ExportForm) =>
      router.push({ pathname: '/export/[formSlug]', params: { formSlug: f.slug } }),
    [router],
  )

  /**
   * Bước 1 của phiếu mới (modal `/export-form/new/info`): mỗi (người dùng, kho) chỉ một bản nháp phiếu
   * mới — đã có trên máy thì mở lại nó (ở bước 1), chưa có thì dựng bản trắng có mã gợi ý. `navigate`
   * (không `push`): bấm hai lần liền vẫn chỉ một modal.
   */
  const openCreate = useCallback(() => router.navigate('/export-form/new/info'), [router])

  const openFilter = useCallback(() => router.navigate('/export-filter'), [router])
  const headerOptions = useMemo((): NativeStackNavigationOptions => {
    const filterButton = {
      active: chipFiltered,
      label: t('exportForms:list.filters.button'),
      activeLabel: t('exportForms:list.filters.buttonOn'),
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
    label: t(`exportForms:list.filter.${s}`),
  }))
  const fieldItems = SEARCH_FIELDS.map((f) => ({ value: f, label: t(`exportForms:field.${f}`) }))

  const header = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <SearchField
        value={query}
        onChangeText={(text) => useExportListFilter.getState().setQuery(text)}
        placeholder={t('exportForms:list.searchPlaceholder')}
        clearLabel={t('common:clearSearch')}
      />
      {isError && !!data ? (
        <ErrorBanner
          message={t('exportForms:list.refreshError')}
          retryLabel={t('common:retry')}
          busy={isFetching}
          onRetry={retry}
        />
      ) : null}
      <SegmentedControl
        testID="export-status"
        items={statusItems}
        value={status}
        onChange={(s) => useExportListFilter.getState().setStatus(s)}
      />
      {query.trim() !== '' ? (
        <SegmentedControl
          testID="export-field"
          items={fieldItems}
          value={field}
          onChange={(f) => useExportListFilter.getState().setField(f)}
        />
      ) : null}
      {chipFiltered ? (
        <FilterSummary
          store={useExportListFilter}
          extraLabels={extraLabels}
          onClearExtra={clearType}
          onOpen={openFilter}
        />
      ) : null}
    </View>
  )

  const renderItem = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: ExportForm
      index: number
      section: DayGroup<ExportForm>
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
          <ExportFormRow form={item} locale={locale} onPress={openForm} />
        </View>
      )
    },
    [radius.groupLarge, locale, openForm],
  )
  const firstKey = sections[0]?.key
  const renderSectionHeader = useCallback(
    ({ section }: { section: DayGroup<ExportForm> }) => (
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
        title={t('exportForms:list.loadError')}
        description={exportFormErrorMessage(error ?? lastError, t)}
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
    <FormListSkeleton label={t('exportForms:list.loading')} rowTestID="export-skeleton-row" />
  ) : chipFiltered ? (
    // Có bộ lọc chip thì ưu tiên câu này (có lối ra "Xoá lọc"), kể cả khi đang tìm kiếm.
    <View style={{ paddingTop: 48, gap: 18 }}>
      <EmptyState
        icon={FunnelX}
        title={t('exportForms:list.emptyFiltered')}
        description={t('exportForms:list.emptyFilteredDescription')}
      />
      <Button
        variant="outline"
        style={{ alignSelf: 'center' }}
        onPress={() => {
          useExportListFilter.getState().clearChips()
          clearType()
        }}
      >
        {t('exportForms:list.filters.clear')}
      </Button>
    </View>
  ) : debounced ? (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={SearchX}
        title={t('exportForms:list.noMatch')}
        description={t('exportForms:list.noMatchDescription')}
      />
    </View>
  ) : (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={PackageMinus}
        title={t('exportForms:list.empty')}
        description={t('exportForms:list.emptyDescription')}
      />
    </View>
  )

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      <Stack.Screen options={headerOptions} />
      <WarehouseTransition style={{ flex: 1 }}>
        <SectionList
          testID="export-list"
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
        <FloatingCreateButton label={t('exportForms:list.createForm')} onPress={openCreate} />
      ) : null}
    </Screen>
  )
}
