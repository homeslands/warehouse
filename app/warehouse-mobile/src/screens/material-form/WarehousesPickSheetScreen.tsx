import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { useMaterialDraft } from '@/features/material-form'
import { canAssignWarehouse, warehousePickStates } from '@/features/warehouse-assign'
import { filterWarehouses } from '@/features/warehouse-picker'
import { haptics } from '@/shared/lib/haptics'
import {
  MaterialPickList,
  PickSelectAllBar,
  SearchField,
  SheetScaffold,
  Text,
  type PickItem,
} from '@/shared/ui'

/**
 * Màn con `warehouses` của sheet `/material-form` (tạo vật tư): chọn NHIỀU kho sẽ gắn vật tư vào. Danh sách
 * kho cùng nguồn bộ chọn kho; kho đã tắt khoá "Đã tắt". ✓ "Xong" ghi `useMaterialDraft.warehouses` rồi quay
 * lại form; ✕ bỏ thay đổi. Thiếu quyền gắn kho → quay lại.
 */
export function WarehousesPickSheetScreen() {
  const { t } = useTranslation(['catalog', 'common'])
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const fetched = useWarehouseStore((s) => s.warehouses)
  const all = fetched ?? user?.warehouses ?? []
  const allowed = canAssignWarehouse(user)
  const states = warehousePickStates(all, { warehouses: [] })
  const pickable = new Set(
    states.filter((s) => s.state === 'pickable').map((s) => s.warehouse.slug),
  )

  const [text, setText] = useState('')
  const [picked, setPicked] = useState<readonly string[]>(
    () => useMaterialDraft.getState().warehouses ?? [],
  )
  useEffect(() => {
    if (!allowed) router.back()
  }, [allowed, router])
  if (!allowed) return null

  const valid = picked.filter((slug) => pickable.has(slug))
  const checked: ReadonlySet<string> = new Set(valid)

  const toggle = (slug: string) => {
    if (!pickable.has(slug)) return
    setPicked((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]))
    haptics.selection()
  }
  const selectMany = (ids: string[], select: boolean) =>
    setPicked((prev) => {
      if (!select) return prev.filter((slug) => !ids.includes(slug))
      return [...prev, ...ids.filter((id) => pickable.has(id) && !prev.includes(id))]
    })
  const done = () => {
    useMaterialDraft.getState().setWarehouses([...valid])
    router.back()
  }

  const visible = new Set(
    filterWarehouses(
      states.map((s) => s.warehouse),
      text,
    ).map((w) => w.slug),
  )
  const items: PickItem[] = states
    .filter((s) => visible.has(s.warehouse.slug))
    .map(({ warehouse, state }) => ({
      id: warehouse.slug,
      name: warehouse.name,
      code: warehouse.code,
      detail: null,
      state,
      lockedLabel: state === 'locked' ? t('catalog:warehouseAssign.inactive') : undefined,
      lockedTone: state === 'locked' ? 'destructive' : undefined,
    }))
  // Không giới hạn số kho: luôn ≥ 1 để danh sách không bao giờ "đầy".
  const capacityLeft = Math.max(1, pickable.size - valid.length)

  return (
    <SheetScaffold
      testID="material-warehouses-sheet"
      title={t('catalog:material.pickWarehouses')}
      cancelLabel={t('common:cancel')}
      doneLabel={t('common:done')}
      onCancel={() => router.back()}
      onDone={done}
      top={
        states.length === 0 ? undefined : (
          <>
            <SearchField
              value={text}
              onChangeText={setText}
              placeholder={t('catalog:warehouseAssign.searchPlaceholder')}
              shape="pill"
              raised
            />
            <PickSelectAllBar
              items={items}
              checked={checked}
              capacityLeft={capacityLeft}
              onSelectMany={selectMany}
              selectedCount={valid.length}
            />
          </>
        )
      }
    >
      <View style={{ gap: 12, paddingTop: 4 }}>
        {states.length === 0 ? (
          <Text muted size={14} style={{ paddingHorizontal: 4 }}>
            {t('catalog:warehouseAssign.empty')}
          </Text>
        ) : (
          <MaterialPickList
            items={items}
            checked={checked}
            onToggle={toggle}
            capacityLeft={capacityLeft}
            capacityLabel=""
            empty={
              <Text muted style={{ textAlign: 'center', paddingTop: 16 }}>
                {t('catalog:warehouseAssign.noMatch')}
              </Text>
            }
          />
        )}
      </View>
    </SheetScaffold>
  )
}
