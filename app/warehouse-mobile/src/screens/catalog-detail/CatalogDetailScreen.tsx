import { useQueryClient } from '@tanstack/react-query'
import {
  Stack,
  useLocalSearchParams,
  useRouter,
  type NativeStackNavigationOptions,
} from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, ScrollView, View } from 'react-native'

import { getSessionEpoch, useAuthStore } from '@/entities/session'
import { unitUsage } from '@/entities/unit'
import { CATALOG_CONFIG, classifyCatalogError, type CatalogKind } from '@/features/catalog-form'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'
import { formatFullDate } from '@/shared/lib/format'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'
import { useTheme } from '@/shared/theme/useTheme'
import {
  Button,
  EmptyState,
  FirstLoadState,
  DashCard,
  ListGroup,
  ListRow,
  Screen,
  SectionHeader,
  Text,
  ErrorBox,
  CARD_CONTENT_INSET,
} from '@/shared/ui'
import { SearchX, ShieldOff } from '@/shared/ui/icons'

/** Nút chữ "Sửa" phẳng cho Android (vùng chạm 44). */
function AndroidEditButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 44,
        height: 44,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text weight="semibold" size={16} style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View accessible style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 2 }}>
      <Text muted size={12.5}>
        {label}
      </Text>
      {children}
    </View>
  )
}

/**
 * Chi tiết một Đơn vị / Loại vật tư (push từ danh sách: `/account/units/[slug]`, `/account/material-types/[slug]`).
 * Header nhỏ: tiêu đề = mã, nút chữ "Sửa" (khi có UPDATE) mở sheet sửa. Nội dung: thông tin, khối "Đang
 * dùng" (đơn vị, khi biết số), chân ngày tạo / cập nhật, nút Xoá (khi có DELETE). Xoá: `confirmAction`
 * + `useGuardedAction`; xong thì gỡ cache chi tiết, làm mới danh sách + tồn kho rồi quay lại danh sách.
 */
export function CatalogDetailScreen({ kind }: { kind: CatalogKind }) {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const { colors } = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const config = CATALOG_CONFIG[kind]
  const prefix = config.i18nPrefix
  const { slug } = useLocalSearchParams<{ slug?: string }>()
  const user = useAuthStore((s) => s.user)
  const abilities = config.abilities(user)
  const query = config.useItem(abilities.read ? slug : undefined)
  const item = query.data ?? null

  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const confirmingDelete = useRef(false)

  const loadMissing = !!slug && !item && isApiError(query.error) && query.error.statusCode === 404
  // Bản ghi không còn khi tải → danh sách đang giữ dòng cũ, làm mới nó.
  useEffect(() => {
    if (loadMissing) void queryClient.invalidateQueries({ queryKey: config.listKey })
  }, [loadMissing, queryClient, config.listKey])

  const handleError = (e: unknown) => {
    const target = classifyCatalogError(kind, e)
    if ('target' in target && target.target === 'notFound') {
      setNotFound(true)
      void queryClient.invalidateQueries({ queryKey: config.listKey })
    } else if ('target' in target && target.target === 'inUse') {
      setDeleteError(errorMessage(e, t))
    } else {
      setGeneralError(errorMessage(e, t))
    }
  }

  const remove = useGuardedAction(
    async () => {
      if (!item) return
      const epoch = getSessionEpoch()
      await config.remove(item.slug)
      if (getSessionEpoch() !== epoch) return
      // Bản ghi đã xoá: bỏ khỏi cache (invalidate sẽ bắn thêm GET 404 thừa).
      queryClient.removeQueries({ queryKey: config.detailKey(item.slug) })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: config.listKey }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ])
      router.back()
    },
    { onError: handleError },
  )

  const usage = item ? config.usageCount(item) : 0
  const askDelete = async () => {
    if (!item || remove.pending || usage > 0 || confirmingDelete.current) return
    confirmingDelete.current = true
    setDeleteError(null)
    setGeneralError(null)
    let confirmed = false
    try {
      confirmed = await confirmAction({
        title: t(`catalog:${prefix}.deleteConfirm`, { code: item.code }),
        message: t('catalog:deleteMessage'),
        confirmLabel: t('catalog:delete'),
        cancelLabel: t('common:cancel'),
        destructive: true,
      })
    } finally {
      confirmingDelete.current = false
    }
    if (confirmed) await remove.run()
  }

  const canEdit = abilities.read && abilities.update && !!item && !notFound
  const editLabel = t('catalog:edit')
  const code = item?.code
  const headerOptions = useMemo((): NativeStackNavigationOptions => {
    const edit = () => router.push({ pathname: config.formRoute, params: { slug: slug ?? '' } })
    return {
      title: code ?? '',
      ...(canEdit
        ? Platform.OS === 'ios'
          ? {
              unstable_headerRightItems: () => [
                {
                  type: 'button' as const,
                  label: editLabel,
                  accessibilityLabel: editLabel,
                  onPress: edit,
                },
              ],
            }
          : { headerRight: () => <AndroidEditButton label={editLabel} onPress={edit} /> }
        : null),
    }
  }, [code, canEdit, editLabel, router, config.formRoute, slug])

  if (!abilities.read) {
    return (
      <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
        <Stack.Screen options={headerOptions} />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon={ShieldOff} title={t('catalog:noAccess')} description="" />
        </View>
      </Screen>
    )
  }

  if (!item) {
    return (
      <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
        <Stack.Screen options={headerOptions} />
        {loadMissing ? (
          <View style={{ paddingTop: 64 }} accessibilityRole="alert">
            <EmptyState icon={SearchX} title={t('catalog:gone')} description="" />
          </View>
        ) : (
          <FirstLoadState
            failed={query.isError}
            errorTitle={t('catalog:loadError')}
            errorMessage={errorMessage(query.error, t)}
            loadingLabel={t('catalog:loading')}
            fetching={query.isFetching}
            onRetry={() => void query.refetch({ cancelRefetch: false })}
          />
        )}
      </Screen>
    )
  }

  const counts = kind === 'unit' && item.materialCount ? unitUsage(item) : null
  const dash = t('catalog:emptyValue')
  const created = item.createdAt ? formatFullDate(item.createdAt) : ''
  const updated = item.updatedAt ? formatFullDate(item.updatedAt) : ''

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      <Stack.Screen options={headerOptions} />
      <ScrollView
        testID="catalog-detail"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
      >
        {notFound ? <ErrorBox message={t('catalog:gone')} /> : null}
        {generalError ? <ErrorBox message={generalError} /> : null}
        <DashCard
          testID="catalog-detail-hero"
          style={{ gap: 4 }}
          accessibilityLabel={`${item.name}, ${t('catalog:code')} ${item.code}`}
        >
          <Text accessibilityRole="header" weight="bold" size={22} style={{ letterSpacing: -0.4 }}>
            {item.name}
          </Text>
          <Text code muted size={15}>
            {item.code}
          </Text>
        </DashCard>
        <ListGroup variant="card" inset={20}>
          <InfoRow label={t('catalog:description')}>
            <Text size={16}>{item.description || dash}</Text>
          </InfoRow>
        </ListGroup>
        {counts && !notFound ? (
          <View testID="unit-usage">
            <SectionHeader variant="sentence" inset={CARD_CONTENT_INSET}>
              {t('catalog:unit.usage.title')}
            </SectionHeader>
            <ListGroup variant="card" inset={20}>
              <ListRow
                label={t('catalog:unit.usage.base')}
                subtitle={
                  <Text muted size={13}>
                    {t('catalog:unit.usage.baseHint')}
                  </Text>
                }
                value={t('catalog:unit.usage.count', { count: counts.base })}
              />
              <ListRow
                label={t('catalog:unit.usage.conversion')}
                subtitle={
                  <Text muted size={13}>
                    {t('catalog:unit.usage.conversionHint')}
                  </Text>
                }
                value={t('catalog:unit.usage.count', { count: counts.conversion })}
              />
            </ListGroup>
          </View>
        ) : null}
        {created || updated ? (
          <Text numeric muted size={12.5} style={{ textAlign: 'center' }}>
            {t('catalog:timestamps', { created: created || dash, updated: updated || dash })}
          </Text>
        ) : null}
        {abilities.delete && !notFound ? (
          <View style={{ gap: 6, paddingTop: 8 }}>
            <Button
              variant="secondaryDestructive"
              disabled={remove.pending || usage > 0}
              loading={remove.pending}
              onPress={() => void askDelete()}
            >
              {t('catalog:delete')}
            </Button>
            {usage > 0 ? (
              <Text muted size={12.5} style={{ textAlign: 'center' }}>
                {t(`catalog:${prefix}.inUseHint`, { count: usage })}
              </Text>
            ) : null}
            {deleteError ? (
              <Text
                size={13}
                style={{ textAlign: 'center', color: colors.destructive }}
                accessibilityRole="alert"
              >
                {deleteError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
