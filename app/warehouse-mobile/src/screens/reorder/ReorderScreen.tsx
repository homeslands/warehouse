import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  Share,
  StyleSheet,
  View,
} from 'react-native'

import { useAllAvailableMaterials } from '@/entities/import-form'
import { inventoryErrorMessage, useInventory } from '@/entities/inventory'
import { can, useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import {
  buildReorderGroups,
  reorderGroupKey,
  reorderShareText,
  shareableRows,
  todayKey,
  useReorderStore,
  type ReorderGroup,
  type ReorderRow as Row,
} from '@/features/reorder'
import { haptics } from '@/shared/lib/haptics'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useTheme } from '@/shared/theme/useTheme'
import {
  EmptyState,
  ErrorBanner,
  FirstLoadState,
  FormListSkeleton,
  ListSectionTitle,
  ROW_PRESS_DELAY_MS,
  Screen,
  Text,
} from '@/shared/ui'
import { Package, Share2 } from '@/shared/ui/icons'

import { effectiveReorderChip, ReorderLevelChips, type ReorderChip } from './ReorderLevelChips'
import { ReorderRow } from './ReorderRow'

type Section = { key: string; group: ReorderGroup; data: Row[] }

/** Dòng gửi cuối nhóm — khuôn dòng "+ Gắn vào kho": ô icon `accentSoft` + nhãn accent. */
function SendRow({
  testID,
  label,
  locked,
  onPress,
}: {
  testID: string
  label: string
  locked: boolean
  onPress: () => void
}) {
  const { t } = useTranslation('inventory')
  const { colors } = useTheme()
  return (
    <View style={{ marginHorizontal: -16 }}>
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          marginLeft: 16 + 44 + 14,
          backgroundColor: colors.listSeparator,
        }}
      />
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: locked }}
        disabled={locked}
        onPress={onPress}
        unstable_pressDelay={ROW_PRESS_DELAY_MS}
        style={({ pressed }) => ({
          minHeight: 60,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 16,
          paddingVertical: 8,
          opacity: locked ? 0.55 : 1,
          backgroundColor: pressed ? colors.rowPressed : colors.background,
        })}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            borderCurve: 'continuous',
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Share2 size={20} color={colors.accent} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text weight="medium" size={16} numberOfLines={1} style={{ color: colors.accent }}>
            {label}
          </Text>
          {locked ? (
            <Text muted size={13} numberOfLines={2}>
              {t('reorder.sendLocked')}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  )
}

/**
 * Màn "Đề xuất đặt hàng" (`/stock/reorder`, push trong Stack tab Tồn kho): vật tư dưới min / sắp thiếu của
 * kho đang chọn, gom theo nơi đặt. Giao diện theo mẫu tab Tồn kho. Số đã sửa / nơi đặt / dấu "đã đặt" lưu
 * trên máy (`useReorderStore`, khoá theo người dùng + kho). Chia sẻ một nhóm → hỏi đánh dấu đã đặt.
 */
export function ReorderScreen() {
  const { t, i18n } = useTranslation(['inventory', 'common', 'errors'])
  const { colors } = useTheme()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const warehouse = useWarehouseStore((s) => s.current)
  const warehouseSlug = warehouse?.slug
  const userKey = user?.userSlug ?? user?.userName
  const locale = i18n.language === 'en' ? 'en' : 'vi'

  const inventory = useInventory(warehouseSlug)
  const { data } = inventory
  const canPick = !!user && can(user, 'IMPORT_FORM_CREATE')
  const available = useAllAvailableMaterials(canPick ? warehouseSlug : undefined)
  // Danh sách bên bán bị cắt (chạm trần trang) → thiếu dữ liệu, coi như không có: một nhóm chung.
  const materials = canPick && !available.data?.truncated ? (available.data?.items ?? null) : null

  const storeLocal = useReorderStore((s) => s.local)
  const loaded = useReorderStore((s) => s.loaded)
  const scope = useReorderStore((s) => s.scope)
  const scopeNow = userKey && warehouseSlug ? `${userKey}|${warehouseSlug}` : null
  const ready = loaded && scope === scopeNow
  // Khung hình đầu sau đổi kho / người: store còn dữ liệu scope cũ → không dùng.
  const local = useMemo(() => (ready ? storeLocal : {}), [ready, storeLocal])

  // Đổi người dùng / kho → nạp lại phần lưu trên máy theo khoá mới.
  useEffect(() => {
    if (userKey && warehouseSlug) void useReorderStore.getState().load(userKey, warehouseSlug)
  }, [userKey, warehouseSlug])

  // Dọn dấu / số của vật tư đã ra khỏi danh sách — CHỈ khi đã có dữ liệu tồn của kho này.
  useEffect(() => {
    if (data !== undefined && ready) useReorderStore.getState().prune(data, todayKey())
  }, [data, ready])

  const [pickedChip, setChip] = useState<ReorderChip>('all')
  const items = useMemo(() => data ?? [], [data])

  const counts = useMemo(() => {
    const rows = buildReorderGroups({ items, materials, local, includeYellow: true }).flatMap(
      (g) => g.rows,
    )
    const red = rows.filter((r) => r.level === 'red').length
    return { all: rows.length, red, yellow: rows.length - red }
  }, [items, materials, local])

  const chip = effectiveReorderChip(pickedChip, counts)

  const sections = useMemo((): Section[] => {
    return buildReorderGroups({ items, materials, local, includeYellow: chip !== 'red' })
      .map((group) => ({
        key: reorderGroupKey(group),
        group,
        data: chip === 'yellow' ? group.rows.filter((r) => r.level === 'yellow') : group.rows,
      }))
      .filter((s) => s.data.length > 0)
  }, [items, materials, local, chip])

  const [pulling, setPulling] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const { refetch } = inventory
  const retry = useCallback(() => void refetch({ cancelRefetch: false }), [refetch])
  const onRefresh = useCallback(async () => {
    setPulling(true)
    try {
      await refetch({ cancelRefetch: false })
    } finally {
      if (mounted.current) setPulling(false)
    }
  }, [refetch])

  const openRow = useCallback(
    (materialSlug: string) => router.push({ pathname: '/reorder-line', params: { materialSlug } }),
    [router],
  )

  const sharing = useRef(false)
  const share = async (group: ReorderGroup) => {
    if (sharing.current || !ready) return
    const rows = shareableRows(group)
    if (rows.length === 0) return
    sharing.current = true
    const startScope = useReorderStore.getState().scope
    try {
      const message = reorderShareText({
        warehouseName: warehouse?.name ?? '',
        date: new Date(),
        supplierName: group.kind === 'supplier' ? group.supplier.name : null,
        rows,
        t,
        locale,
      })
      const result = await Share.share({ message })
      if (result.action !== Share.sharedAction) return
      const yes = await confirmAction({
        title: t('inventory:reorder.markTitle'),
        // Android: `Share.share` báo `sharedAction` cả khi người dùng đóng bảng chọn → hỏi lại cho chắc.
        message:
          group.kind === 'supplier'
            ? t('inventory:reorder.markMessage', {
                count: rows.length,
                supplier: group.supplier.name,
              })
            : t('inventory:reorder.markListMessage', { count: rows.length }),
        confirmLabel: t('inventory:reorder.markConfirm'),
        cancelLabel: t('common:cancel'),
      })
      // Đổi kho / người dùng trong lúc chia sẻ → không đánh dấu vào khoá mới.
      if (!yes || useReorderStore.getState().scope !== startScope) return
      useReorderStore.getState().markOrdered(
        rows.map((r) => r.item.materialSlug),
        todayKey(),
      )
      haptics.success()
    } catch {
      Alert.alert(t('inventory:reorder.shareErrorTitle'), t('errors:unknown'))
    } finally {
      sharing.current = false
    }
  }

  const titleOf = (group: ReorderGroup) =>
    group.kind === 'supplier' ? group.supplier.name : t(`inventory:reorder.group.${group.kind}`)
  const subtitleOf = (rows: Row[]) => {
    const ordered = rows.filter((r) => r.orderedAt != null).length
    return ordered > 0
      ? t('inventory:reorder.groupCountOrdered', { count: rows.length, ordered })
      : t('inventory:reorder.groupCount', { count: rows.length })
  }

  const firstKey = sections[0]?.key
  const failedFirstLoad = !data && inventory.errorUpdateCount > 0
  const empty = failedFirstLoad ? (
    <FirstLoadState
      failed
      errorTitle={t('inventory:loadError')}
      errorMessage={inventoryErrorMessage(inventory.error, t)}
      loadingLabel={t('inventory:loading')}
      fetching={inventory.isFetching}
      onRetry={retry}
    />
  ) : !data ? (
    <FormListSkeleton
      label={t('inventory:reorder.loading')}
      rowTestID="reorder-skeleton-row"
      rows={6}
    />
  ) : (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={Package}
        title={t('inventory:reorder.empty')}
        description={t('inventory:reorder.emptyDescription')}
      />
    </View>
  )

  const header = (
    <View style={{ gap: 12, paddingBottom: 4 }}>
      <Text muted size={13} style={{ paddingHorizontal: 2 }}>
        {t('inventory:reorder.subtitle', { warehouse: warehouse?.name ?? '' })}
      </Text>
      {inventory.isError && !!data ? (
        <ErrorBanner
          message={t('inventory:refreshError')}
          retryLabel={t('common:retry')}
          busy={inventory.isFetching}
          onRetry={retry}
        />
      ) : null}
      {canPick && available.isError ? (
        <ErrorBanner
          message={t('inventory:reorder.suppliersError')}
          retryLabel={t('common:retry')}
          busy={available.isFetching}
          onRetry={() => void available.refetch({ cancelRefetch: false })}
        />
      ) : null}
      {data && counts.all > 0 ? (
        <ReorderLevelChips counts={counts} value={chip} onChange={setChip} />
      ) : null}
    </View>
  )

  return (
    <Screen edges={['left', 'right']} tone="plain" collapsable={false}>
      <Stack.Screen options={{ title: t('inventory:reorder.title') }} />
      <SectionList
        testID="reorder-list"
        sections={sections}
        keyExtractor={(row) => row.item.slug}
        renderItem={({ item: row, index, section }) => (
          <ReorderRow
            row={row}
            locale={locale}
            first={index === 0}
            choose={section.group.kind === 'choose'}
            groupSupplierSlug={
              section.group.kind === 'supplier' ? section.group.supplier.slug : null
            }
            onPress={openRow}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: section.key === firstKey ? 6 : 24 }}>
            <ListSectionTitle title={titleOf(section.group)} subtitle={subtitleOf(section.data)} />
          </View>
        )}
        renderSectionFooter={({ section }) => {
          const { group } = section
          if (group.kind === 'choose') return null
          return (
            <SendRow
              testID={`reorder-send-${section.key}`}
              label={
                group.kind === 'supplier'
                  ? t('inventory:reorder.sendTo', { supplier: group.supplier.name })
                  : t('inventory:reorder.shareList')
              }
              locked={!ready || shareableRows(group).length === 0}
              onPress={() => void share(group)}
            />
          )
        }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentInsetAdjustmentBehavior="automatic"
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
