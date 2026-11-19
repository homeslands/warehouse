import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useSuppliers } from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { useMaterialDraft } from '@/features/material-form'
import { canAttachSupplier } from '@/features/warehouse-assign'
import { haptics } from '@/shared/lib/haptics'
import { normalizeForSearch } from '@/shared/lib/search'
import {
  MaterialPickList,
  PickSelectAllBar,
  SearchField,
  SheetScaffold,
  Text,
  type PickItem,
} from '@/shared/ui'

/**
 * Màn con `suppliers` của sheet `/material-form` (tạo vật tư): chọn NHIỀU bên bán sẽ gắn vật tư vào. Danh
 * sách từ `GET /suppliers` (làm mới mỗi lần mở). ✓ "Xong" ghi `useMaterialDraft.suppliers` rồi quay lại
 * form; ✕ bỏ thay đổi. Thiếu quyền gắn bên bán → quay lại.
 */
export function SuppliersPickSheetScreen() {
  const { t } = useTranslation(['catalog', 'common'])
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const allowed = canAttachSupplier(user)
  const query = useSuppliers(allowed, { refreshOnOpen: true })
  const all = query.data ?? []
  const known = new Set(all.map((s) => s.slug))

  const [text, setText] = useState('')
  const [picked, setPicked] = useState<readonly string[]>(
    () => useMaterialDraft.getState().suppliers ?? [],
  )
  useEffect(() => {
    if (!allowed) router.back()
  }, [allowed, router])
  if (!allowed) return null

  // Chỉ giữ bên bán còn trong danh sách; chưa tải xong thì giữ nguyên lựa chọn cũ.
  const valid = query.data ? picked.filter((slug) => known.has(slug)) : [...picked]
  const checked: ReadonlySet<string> = new Set(valid)

  const toggle = (slug: string) => {
    if (!known.has(slug)) return
    setPicked((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]))
    haptics.selection()
  }
  const selectMany = (ids: string[], select: boolean) =>
    setPicked((prev) => {
      if (!select) return prev.filter((slug) => !ids.includes(slug))
      return [...prev, ...ids.filter((id) => known.has(id) && !prev.includes(id))]
    })
  const done = () => {
    useMaterialDraft.getState().setSuppliers([...valid])
    router.back()
  }

  const q = normalizeForSearch(text)
  const items: PickItem[] = all
    .filter(
      (s) => !q || normalizeForSearch(s.name).includes(q) || normalizeForSearch(s.code).includes(q),
    )
    .map((s) => ({
      id: s.slug,
      name: s.name,
      code: s.code,
      detail: null,
      state: 'pickable' as const,
    }))
  // Không giới hạn số bên bán: luôn ≥ 1 để danh sách không bao giờ "đầy".
  const capacityLeft = Math.max(1, all.length - valid.length)

  return (
    <SheetScaffold
      testID="material-suppliers-sheet"
      title={t('catalog:material.pickSuppliers')}
      cancelLabel={t('common:cancel')}
      doneLabel={t('common:done')}
      onCancel={() => router.back()}
      onDone={done}
      top={
        all.length === 0 ? undefined : (
          <>
            <SearchField
              value={text}
              onChangeText={setText}
              placeholder={t('catalog:material.suppliersSearchPlaceholder')}
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
        {all.length === 0 ? (
          <Text muted size={14} style={{ paddingHorizontal: 4 }}>
            {query.isError
              ? t('catalog:material.suppliersLoadError')
              : query.isPending
                ? t('common:loading')
                : t('catalog:material.suppliersEmpty')}
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
                {t('catalog:material.suppliersNoMatch')}
              </Text>
            }
          />
        )}
      </View>
    </SheetScaffold>
  )
}
