import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  materialAbilities,
  useAvailableConversionUnits,
  type MaterialRef,
} from '@/entities/material'
import { can, useAuthStore } from '@/entities/session'
import { useMaterialTypes } from '@/entities/material-type'
import { useUnits } from '@/entities/unit'
import { errorMessage } from '@/shared/api/error-message'
import { useMaterialDraft, type MaterialDraftField } from '@/features/material-form'
import { filterCatalog, type CatalogItem } from '@/shared/lib/catalog'
import { useTheme } from '@/shared/theme/useTheme'
import {
  EmptyState,
  FirstLoadState,
  ListGroup,
  ListRow,
  SearchField,
  SheetScaffold,
  Text,
} from '@/shared/ui'
import { Check, SearchX } from '@/shared/ui/icons'

const TITLE_KEY = {
  type: 'catalog:material.pickType',
  baseUnit: 'catalog:material.pickBaseUnit',
  unit: 'catalog:material.pickUnit',
} as const

/**
 * Màn con `pick` của sheet `/material-form` và `/conversion-unit-form` (`?field=type|baseUnit|unit`,
 * `&material=` cho `unit`): ô tìm (lọc máy) + danh sách, ✓ mục đang chọn. Chạm → ghi vào
 * `useMaterialDraft` rồi quay lại form gốc.
 */
export function PickSheetScreen() {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const { colors } = useTheme()
  const router = useRouter()
  const { field: rawField, material } = useLocalSearchParams<{
    field?: string
    material?: string
  }>()
  const field: MaterialDraftField =
    rawField === 'baseUnit' || rawField === 'unit' ? rawField : 'type'
  const selected = useMaterialDraft((s) => s[field])
  const [query, setQuery] = useState('')

  const user = useAuthStore((s) => s.user)
  const abilities = materialAbilities(user)
  // Deep link: tự kiểm quyền / tham số theo field, thiếu thì quay lại, không gọi API.
  const allowed =
    field === 'type'
      ? abilities.read
      : field === 'baseUnit'
        ? can(user, 'UNIT_READ')
        : abilities.manageConversions && !!material
  useEffect(() => {
    if (!allowed) router.back()
  }, [allowed, router])

  const types = useMaterialTypes({ enabled: allowed && field === 'type' })
  const units = useUnits({ enabled: allowed && field === 'baseUnit' })
  const available = useAvailableConversionUnits(material, { enabled: allowed && field === 'unit' })
  const source = field === 'type' ? types : field === 'baseUnit' ? units : available
  const items: readonly CatalogItem[] | undefined = source.data
  const shown = items ? filterCatalog(items, query) : []

  const choose = (item: CatalogItem) => {
    const ref: MaterialRef = { slug: item.slug, code: item.code, name: item.name }
    useMaterialDraft.getState().set(field, ref)
    router.back()
  }

  if (!allowed) return null

  return (
    <SheetScaffold
      testID="material-pick-sheet"
      title={t(TITLE_KEY[field])}
      cancelLabel={t('common:cancel')}
      onCancel={() => router.back()}
      grouped
    >
      {!items ? (
        <FirstLoadState
          failed={source.isError}
          errorTitle={t('catalog:loadError')}
          errorMessage={errorMessage(source.error, t)}
          loadingLabel={t('catalog:loading')}
          fetching={source.isFetching}
          onRetry={() => void source.refetch({ cancelRefetch: false })}
        />
      ) : (
        <View style={{ gap: 12, paddingTop: 4 }}>
          <SearchField
            shape="pill"
            value={query}
            onChangeText={setQuery}
            placeholder={t('catalog:searchPlaceholder')}
          />
          {shown.length === 0 ? (
            <View style={{ paddingTop: 32 }}>
              <EmptyState
                icon={SearchX}
                title={
                  items.length === 0 ? t('catalog:material.pickEmpty') : t('catalog:noResults')
                }
                description=""
              />
            </View>
          ) : (
            <ListGroup inset={16}>
              {shown.map((item) => (
                <ListRow
                  key={item.slug}
                  label={item.name}
                  subtitle={
                    <Text muted size={13}>
                      {item.code}
                    </Text>
                  }
                  selected={selected?.slug === item.slug}
                  trailing={
                    selected?.slug === item.slug ? <Check size={18} color={colors.primary} /> : null
                  }
                  onPress={() => choose(item)}
                />
              ))}
            </ListGroup>
          )}
        </View>
      )}
    </SheetScaffold>
  )
}
