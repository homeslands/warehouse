import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, View } from 'react-native'

import { removeMaterialFromWarehouse } from '@/entities/inventory'
import type { Material, MaterialWarehouse } from '@/entities/material'
import { getSessionEpoch, useAuthStore } from '@/entities/session'
import { invalidateAfterMaterialWrite } from '@/features/material-form'
import { canAssignWarehouse, classifyRemoveError, removeBlock } from '@/features/warehouse-assign'
import { errorMessage } from '@/shared/api/error-message'
import { formatQuantity } from '@/shared/lib/format'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'
import { CARD_CONTENT_INSET, ListGroup, ListRow, SectionHeader, Text } from '@/shared/ui'
import { Plus } from '@/shared/ui/icons'

type Props = {
  item: Material
  baseUnitLabel: string
  locale: 'vi' | 'en'
  onGeneralError: (message: string | null) => void
}

/**
 * Khối "Kho" ở chi tiết vật tư: tồn theo kho; có quyền (`canAssignWarehouse`) thì chạm dòng để gỡ
 * (chặn trước khi còn tồn / giữ chỗ), cuối khối có "+ Gắn vào kho". Gỡ: confirm + `useGuardedAction`,
 * đổi phiên giữa chừng thì bỏ kết quả; ở lại màn.
 */
export function MaterialWarehousesSection({ item, baseUnitLabel, locale, onGeneralError }: Props) {
  const { t } = useTranslation(['catalog', 'common', 'errors'])
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const manage = canAssignWarehouse(user)
  const confirming = useRef(false)
  const epochRef = useRef(0)

  const refresh = () => invalidateAfterMaterialWrite(queryClient, item.slug)

  const remove = useGuardedAction(
    async (w: MaterialWarehouse) => {
      onGeneralError(null)
      epochRef.current = getSessionEpoch()
      const epoch = epochRef.current
      await removeMaterialFromWarehouse(w.slug, item.slug)
      if (getSessionEpoch() !== epoch) return
      await refresh()
    },
    {
      onError: (e) => {
        if (getSessionEpoch() !== epochRef.current) return
        const kind = classifyRemoveError(e)
        if (kind === 'gone') void refresh()
        else if (kind === 'blocked') {
          Alert.alert(t('catalog:warehouseRemove.blockedTitle'), errorMessage(e, t))
          void refresh()
        } else onGeneralError(errorMessage(e, t))
      },
    },
  )

  const askRemove = async (w: MaterialWarehouse) => {
    if (remove.pending || confirming.current) return
    const blockedTitle = t('catalog:warehouseRemove.blockedTitle')
    const block = removeBlock(w)
    if (block === 'stock') {
      Alert.alert(
        blockedTitle,
        t('catalog:warehouseRemove.stockBlocked', {
          quantity: formatQuantity(w.quantity, locale),
          unit: baseUnitLabel,
          warehouse: w.name,
        }),
      )
      return
    }
    if (block === 'reserved') {
      Alert.alert(blockedTitle, t('catalog:warehouseRemove.reservedBlocked', { warehouse: w.name }))
      return
    }
    confirming.current = true
    let confirmed = false
    try {
      confirmed = await confirmAction({
        title: t('catalog:warehouseRemove.confirm', { code: item.code, warehouse: w.name }),
        message: t('catalog:warehouseRemove.confirmMessage'),
        confirmLabel: t('catalog:warehouseRemove.action'),
        cancelLabel: t('common:cancel'),
        destructive: true,
      })
    } finally {
      confirming.current = false
    }
    if (!confirmed) return
    await remove.run(w)
    remove.reset()
  }

  const canAdd = item.baseUnit !== null

  return (
    <View testID="material-warehouses">
      <SectionHeader variant="sentence" inset={CARD_CONTENT_INSET}>
        {t('catalog:material.warehousesTitle')}
      </SectionHeader>
      {item.warehouses.length === 0 ? (
        <Text muted size={13.5} style={{ paddingHorizontal: 16, paddingBottom: manage ? 8 : 0 }}>
          {t('catalog:material.noWarehouses')}
        </Text>
      ) : null}
      {item.warehouses.length > 0 || manage ? (
        <ListGroup variant="card" inset={20}>
          {item.warehouses.map((w) => (
            <ListRow
              key={w.slug}
              label={w.name}
              subtitle={
                <Text muted numeric size={13}>
                  {w.code}
                </Text>
              }
              value={t('catalog:material.warehouseStock', {
                quantity: formatQuantity(w.quantity, locale),
                available: formatQuantity(w.availableQuantity, locale),
                unit: baseUnitLabel,
              })}
              accessibilityHint={manage ? t('catalog:warehouseRemove.hint') : undefined}
              onPress={manage && !remove.pending ? () => void askRemove(w) : undefined}
            />
          ))}
          {manage ? (
            <ListRow
              action
              icon={Plus}
              label={t('catalog:warehouseAssign.add')}
              disabled={!canAdd}
              onPress={
                canAdd
                  ? () =>
                      router.push({
                        pathname: '/warehouse-assign',
                        params: { material: item.slug },
                      })
                  : undefined
              }
            />
          ) : null}
        </ListGroup>
      ) : null}
      {manage && !canAdd ? (
        <Text muted size={13.5} style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          {t('catalog:warehouseAssign.needBaseUnit')}
        </Text>
      ) : null}
    </View>
  )
}
