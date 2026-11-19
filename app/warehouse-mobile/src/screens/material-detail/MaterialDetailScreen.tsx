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

import { deleteMaterial, materialAbilities, materialKeys, useMaterial } from '@/entities/material'
import { getSessionEpoch, useAuthStore } from '@/entities/session'
import { classifyMaterialError, invalidateAfterMaterialWrite } from '@/features/material-form'
import { errorMessage } from '@/shared/api/error-message'
import { isApiError } from '@/shared/api/http'
import { formatFullDate, formatQuantity } from '@/shared/lib/format'
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
import { Package, Plus, SearchX, ShieldOff } from '@/shared/ui/icons'
import { MaterialWarehousesSection } from './MaterialWarehousesSection'

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
 * Chi tiết một Vật tư (push từ danh sách: `/account/materials/[slug]`). Header nhỏ: tiêu đề = mã, nút
 * "Sửa" (khi `update`) mở sheet sửa. Khối: Thông tin; Đơn vị quy đổi (chạm sửa / "+ Thêm" khi
 * `manageConversions`); Kho (tồn); Nhà cung cấp; chân ngày tạo / cập nhật; Xoá (khi `delete`, khoá nếu
 * còn trong kho). Xoá: `confirmAction` + `useGuardedAction`; đổi phiên giữa chừng thì bỏ kết quả.
 */
export function MaterialDetailScreen() {
  const { t, i18n } = useTranslation(['catalog', 'common', 'errors'])
  const { colors } = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { slug } = useLocalSearchParams<{ slug?: string }>()
  const user = useAuthStore((s) => s.user)
  const abilities = materialAbilities(user)
  const query = useMaterial(abilities.read ? slug : undefined)
  const item = query.data ?? null
  const locale = i18n.language === 'en' ? 'en' : 'vi'

  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const confirmingDelete = useRef(false)

  const loadMissing = !!slug && !item && isApiError(query.error) && query.error.statusCode === 404
  useEffect(() => {
    if (loadMissing) void queryClient.invalidateQueries({ queryKey: materialKeys.lists() })
  }, [loadMissing, queryClient])

  const handleError = (e: unknown) => {
    const target = classifyMaterialError(e)
    if ('target' in target && target.target === 'notFound') {
      setNotFound(true)
      void queryClient.invalidateQueries({ queryKey: materialKeys.lists() })
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
      await deleteMaterial(item.slug)
      if (getSessionEpoch() !== epoch) return
      // Bản ghi đã xoá: bỏ khỏi cache (invalidate chi tiết sẽ bắn thêm GET 404 thừa).
      queryClient.removeQueries({ queryKey: materialKeys.detail(item.slug) })
      await invalidateAfterMaterialWrite(queryClient)
      router.back()
    },
    { onError: handleError },
  )

  const inWarehouses = item?.warehouses.length ?? 0
  const askDelete = async () => {
    if (!item || remove.pending || inWarehouses > 0 || confirmingDelete.current) return
    confirmingDelete.current = true
    setDeleteError(null)
    setGeneralError(null)
    let confirmed = false
    try {
      confirmed = await confirmAction({
        title: t('catalog:material.deleteConfirm', { code: item.code }),
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

  const canEdit = abilities.read && abilities.update && !!item && !notFound && !remove.pending
  const editLabel = t('catalog:edit')
  const code = item?.code
  const headerOptions = useMemo((): NativeStackNavigationOptions => {
    const edit = () => router.push({ pathname: '/material-form', params: { slug: slug ?? '' } })
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
  }, [code, canEdit, editLabel, router, slug])

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

  const dash = t('catalog:emptyValue')
  const created = item.createdAt ? formatFullDate(item.createdAt) : ''
  const updated = item.updatedAt ? formatFullDate(item.updatedAt) : ''
  const base = item.units.find((u) => u.isBaseUnit)?.unitCode ?? item.baseUnit?.code ?? ''
  const limit = (n: number) =>
    n === 0 ? t('catalog:material.notSet') : `${formatQuantity(n, locale)} ${base}`.trim()
  const manage = abilities.manageConversions && !notFound && !remove.pending
  const openConversion = (unit?: string) =>
    router.push({
      pathname: '/conversion-unit-form',
      params: unit ? { material: item.slug, unit } : { material: item.slug },
    })

  return (
    <Screen edges={['left', 'right']} tone="grouped" collapsable={false}>
      <Stack.Screen options={headerOptions} />
      <ScrollView
        testID="material-detail"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
      >
        {notFound ? <ErrorBox message={t('catalog:gone')} /> : null}
        {generalError ? <ErrorBox message={generalError} /> : null}
        {/* Đầu trang cùng "dáng" dòng danh sách vật tư: ô icon 44 trung tính + tên + "mã · loại" (font hệ thống). */}
        <DashCard
          testID="material-detail-hero"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
          accessibilityLabel={`${item.name}, ${t('catalog:code')} ${item.code}`}
        >
          <View
            testID="material-detail-tile"
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              borderCurve: 'continuous',
              backgroundColor: colors.fill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Package size={21} strokeWidth={1.9} color={colors.fillForeground} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text
              accessibilityRole="header"
              weight="bold"
              size={22}
              numberOfLines={2}
              style={{ letterSpacing: -0.4 }}
            >
              {item.name}
            </Text>
            <Text testID="material-detail-code" numeric muted size={15} numberOfLines={1}>
              {[item.code, item.type.name].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </DashCard>
        <ListGroup variant="card" inset={20}>
          <InfoRow label={t('catalog:material.type')}>
            <Text size={16}>{`${item.type.code} · ${item.type.name}`}</Text>
          </InfoRow>
          <InfoRow label={t('catalog:material.baseUnit')}>
            <Text size={16}>
              {item.baseUnit ? `${item.baseUnit.code} · ${item.baseUnit.name}` : dash}
            </Text>
          </InfoRow>
          <InfoRow label={t('catalog:material.minimum')}>
            <Text numeric size={16}>
              {limit(item.minimumInventory)}
            </Text>
          </InfoRow>
          <InfoRow label={t('catalog:material.maximum')}>
            <Text numeric size={16}>
              {limit(item.maximumInventory)}
            </Text>
          </InfoRow>
        </ListGroup>

        <View testID="material-conversions">
          <SectionHeader variant="sentence" inset={CARD_CONTENT_INSET}>
            {t('catalog:conversion.title')}
          </SectionHeader>
          <ListGroup variant="card" inset={20}>
            {item.units.map((u) =>
              u.isBaseUnit ? (
                <ListRow
                  key={u.unitSlug}
                  label={u.unitCode}
                  value={t('catalog:material.baseBadge')}
                />
              ) : (
                <ListRow
                  key={u.unitSlug}
                  label={t('catalog:conversion.rateHint', {
                    unit: u.unitCode,
                    rate: formatQuantity(u.conversionRate, locale, 6),
                    base,
                  })}
                  chevron={manage}
                  onPress={manage ? () => openConversion(u.unitSlug) : undefined}
                />
              ),
            )}
            {item.units.length <= 1 && !manage ? (
              <Text muted size={13.5} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                {t('catalog:material.noConversions')}
              </Text>
            ) : null}
            {manage ? (
              <ListRow
                action
                icon={Plus}
                label={t('catalog:conversion.add')}
                onPress={() => openConversion()}
              />
            ) : null}
          </ListGroup>
        </View>

        <MaterialWarehousesSection
          item={item}
          baseUnitLabel={base}
          locale={locale}
          onGeneralError={setGeneralError}
        />

        <View testID="material-suppliers">
          <SectionHeader variant="sentence" inset={CARD_CONTENT_INSET}>
            {t('catalog:material.suppliersTitle')}
          </SectionHeader>
          {item.suppliers.length > 0 ? (
            <ListGroup variant="card" inset={20}>
              {item.suppliers.map((s) => (
                <ListRow
                  key={s.slug}
                  label={s.name}
                  subtitle={
                    <Text muted numeric size={13}>
                      {s.code}
                    </Text>
                  }
                />
              ))}
            </ListGroup>
          ) : (
            <Text muted size={13.5} style={{ paddingHorizontal: 16 }}>
              {t('catalog:material.noSuppliers')}
            </Text>
          )}
        </View>

        {created || updated ? (
          <Text numeric muted size={12.5} style={{ textAlign: 'center' }}>
            {t('catalog:timestamps', { created: created || dash, updated: updated || dash })}
          </Text>
        ) : null}
        {abilities.delete && !notFound ? (
          <View style={{ gap: 6, paddingTop: 8 }}>
            <Button
              variant="secondaryDestructive"
              disabled={remove.pending || inWarehouses > 0}
              loading={remove.pending}
              onPress={() => void askDelete()}
            >
              {t('catalog:delete')}
            </Button>
            {inWarehouses > 0 ? (
              <Text muted size={12.5} style={{ textAlign: 'center' }}>
                {t('catalog:material.inWarehousesHint', { count: inWarehouses })}
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
