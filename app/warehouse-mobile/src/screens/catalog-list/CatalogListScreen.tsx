import { Stack, useRouter, type NativeStackNavigationOptions } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, RefreshControl, SectionList, View } from 'react-native'

import { useMaterialTypes } from '@/entities/material-type'
import { useAuthStore } from '@/entities/session'
import { unitUsage, useUnits, type Unit } from '@/entities/unit'
import { CATALOG_CONFIG, type CatalogKind } from '@/features/catalog-form'
import { errorMessage } from '@/shared/api/error-message'
import { filterCatalog, type CatalogItem } from '@/shared/lib/catalog'
import { useTheme } from '@/shared/theme/useTheme'
import { EmptyState, FirstLoadState, ListSectionTitle, Screen, SearchField } from '@/shared/ui'
import { CatalogRow } from '@/shared/ui/catalog'
import { Plus, Ruler, SearchX, ShieldOff, Tag } from '@/shared/ui/icons'

type Row = CatalogItem & { materialCount?: Unit['materialCount'] }
type Group = { key: string; title?: string; data: Row[] }

/** Nút + phẳng cho Android (vùng chạm 44). */
function AndroidAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Plus size={22} color={colors.foreground} aria-hidden />
    </Pressable>
  )
}

/** Hai hook cùng chữ ký để chọn theo `kind` mà không vi phạm luật hook (kind không đổi suốt đời màn). */
function useCatalogQuery(kind: CatalogKind, enabled: boolean) {
  const units = useUnits({ enabled: enabled && kind === 'unit' })
  const types = useMaterialTypes({ enabled: enabled && kind === 'material-type' })
  return kind === 'unit' ? units : types
}

/**
 * Danh sách Đơn vị / Loại vật tư (push trong Stack tab Tài khoản). Tải hết rồi lọc trên máy; header
 * nhỏ có nút + (khi có quyền tạo) mở sheet tạo; chạm dòng mở màn chi tiết. Đơn vị chia hai nhóm "Đang dùng" / "Chưa dùng" (nhóm rỗng ẩn); loại vật tư một khối không tiêu đề. Không có nút kho: danh mục
 * dùng chung mọi kho.
 */
export function CatalogListScreen({ kind }: { kind: CatalogKind }) {
  const { t } = useTranslation(['catalog', 'common'])
  const { colors } = useTheme()
  const router = useRouter()
  const config = CATALOG_CONFIG[kind]
  const prefix = config.i18nPrefix
  const user = useAuthStore((s) => s.user)
  const abilities = config.abilities(user)
  const { data, error, errorUpdateCount, isFetching, refetch } = useCatalogQuery(
    kind,
    abilities.read,
  )
  const [query, setQuery] = useState('')

  // Lỗi lần đầu rồi Thử lại: query về `pending` và xoá `error` — giữ màn lỗi với câu lỗi gần nhất.
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

  const canCreate = abilities.read && abilities.create
  const addLabel = t(`catalog:${prefix}.create`)
  const headerOptions = useMemo((): NativeStackNavigationOptions => {
    const add = () => router.push(config.formRoute)
    return {
      title: t(`catalog:${prefix}.listTitle`),
      ...(canCreate
        ? Platform.OS === 'ios'
          ? {
              unstable_headerRightItems: () => [
                {
                  type: 'button' as const,
                  label: addLabel,
                  accessibilityLabel: addLabel,
                  icon: { type: 'sfSymbol' as const, name: 'plus' as const },
                  onPress: add,
                },
              ],
            }
          : { headerRight: () => <AndroidAddButton label={addLabel} onPress={add} /> }
        : null),
    }
  }, [t, prefix, canCreate, addLabel, router, config.formRoute])

  const openRow = useCallback(
    (slug: string) =>
      router.push(kind === 'unit' ? `/account/units/${slug}` : `/account/material-types/${slug}`),
    [router, kind],
  )

  const rows = useMemo(() => filterCatalog((data ?? []) as Row[], query), [data, query])

  const sections = useMemo((): Group[] => {
    if (kind !== 'unit') return rows.length > 0 ? [{ key: 'all', data: rows }] : []
    const inUse = rows.filter((r) => unitUsage(r).total > 0)
    const unused = rows.filter((r) => unitUsage(r).total === 0)
    return [
      { key: 'inUse', title: t('catalog:unit.groupInUse'), data: inUse },
      { key: 'unused', title: t('catalog:unit.groupUnused'), data: unused },
    ].filter((g) => g.data.length > 0)
  }, [kind, rows, t])

  const renderItem = useCallback(
    ({ item, index }: { item: Row; index: number }) => {
      return (
        <CatalogRow
          kind={kind}
          first={index === 0}
          slug={item.slug}
          code={item.code}
          name={item.name}
          description={item.description}
          usedCount={kind === 'unit' ? unitUsage(item).total : undefined}
          onPress={openRow}
        />
      )
    },
    [kind, openRow],
  )
  const firstKey = sections[0]?.key
  const renderSectionHeader = useCallback(
    ({ section }: { section: Group }) =>
      section.title ? (
        <View style={{ paddingTop: section.key === firstKey ? 6 : 24 }}>
          <ListSectionTitle title={section.title} />
        </View>
      ) : null,
    [firstKey],
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

  const empty = !data ? (
    <FirstLoadState
      failed={failedFirstLoad}
      errorTitle={t('catalog:loadError')}
      errorMessage={errorMessage(error ?? lastError, t)}
      loadingLabel={t('catalog:loading')}
      fetching={isFetching}
      onRetry={retry}
    />
  ) : data.length === 0 ? (
    <View style={{ paddingTop: 48 }}>
      <EmptyState
        icon={kind === 'unit' ? Ruler : Tag}
        title={t(`catalog:${prefix}.empty`)}
        description={canCreate ? t(`catalog:${prefix}.emptyHint`) : ''}
      />
    </View>
  ) : (
    <View style={{ paddingTop: 48 }}>
      <EmptyState icon={SearchX} title={t('catalog:noResults')} description="" />
    </View>
  )

  return (
    <Screen edges={['left', 'right']} tone="plain" collapsable={false}>
      <Stack.Screen options={headerOptions} />
      <SectionList
        testID="catalog-list"
        sections={sections}
        keyExtractor={(item) => item.slug}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ paddingBottom: 12 }}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={t('catalog:searchPlaceholder')}
              clearLabel={t('common:clearSearch')}
            />
          </View>
        }
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
    </Screen>
  )
}
