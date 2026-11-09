import { Layers, Tag, TriangleAlert, TrendingUp } from '@/shared/ui/icons'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { typesOf, useInventory } from '@/entities/inventory'
import { useWarehouseStore } from '@/entities/warehouse'
import { haptics } from '@/shared/lib/haptics'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'
import { useSheetSubmit } from '@/shared/lib/useSheetSubmit'
import { ChoiceCard, SectionHeader, SheetScaffold } from '@/shared/ui'

import { useStockFilter, type StockLevelFilter } from './stock-filter.store'

type Marked = { level: StockLevelFilter | undefined; typeSlug: string | undefined }

/**
 * Route `/stock-filter` — CHỈ Android: Android không có menu gốc trên header (UIMenu của iOS cần
 * `@expo/ui` trên Android), nên nút Lọc mở sheet chọn này thay cho menu. Cùng hai nhóm với menu iOS
 * ("Mức tồn", "Loại vật tư"), hai bước như mọi sheet chọn: chạm chỉ đánh dấu, ✓ áp dụng rồi đóng;
 * giữ nguyên thì ✓ đóng ngay. Loại lấy từ danh sách tồn trong cache (không gọi mạng thêm).
 */
export function StockFilterSheetScreen() {
  const { t } = useTranslation(['inventory', 'common'])
  const close = useCloseSheet()
  const warehouseSlug = useWarehouseStore((s) => s.current?.slug)
  const { data } = useInventory(warehouseSlug)
  const currentLevel = useStockFilter((s) => s.level)
  const currentType = useStockFilter((s) => s.typeSlug)
  const [marked, setMarked] = useState<Marked>({ level: currentLevel, typeSlug: currentType })

  const types = useMemo(() => {
    const items = data ?? []
    const count = new Map<string, number>()
    for (const i of items) count.set(i.typeSlug, (count.get(i.typeSlug) ?? 0) + 1)
    return {
      total: items.length,
      list: typesOf(items).map((ty) => ({ ...ty, count: count.get(ty.slug) ?? 0 })),
    }
  }, [data])

  const { doneState, submit } = useSheetSubmit({
    onSubmit: async () => {
      const store = useStockFilter.getState()
      store.setLevel(marked.level)
      store.setTypeSlug(marked.typeSlug)
    },
    onClose: close,
    // Ghi vào store không thể lỗi; vẫn khai vì lỗi không bao giờ được nuốt.
    onError: (e) => console.warn('[stock-filter]', e),
  })

  const mark = (next: Partial<Marked>) => {
    const merged = { ...marked, ...next }
    if (
      doneState !== 'idle' ||
      (merged.level === marked.level && merged.typeSlug === marked.typeSlug)
    )
      return
    haptics.selection()
    setMarked(merged)
  }
  const unchanged = marked.level === currentLevel && marked.typeSlug === currentType

  const levels: [StockLevelFilter | undefined, string, typeof Layers][] = [
    [undefined, t('inventory:alertAll'), Layers],
    ['low', t('inventory:alertBelow'), TriangleAlert],
    ['high', t('inventory:alertAbove'), TrendingUp],
  ]

  return (
    <SheetScaffold
      testID="stock-filter-sheet"
      title={t('inventory:filter')}
      cancelLabel={t('common:cancel')}
      doneLabel={t('common:done')}
      onCancel={close}
      onDone={() => (unchanged ? close() : void submit())}
      doneState={doneState}
    >
      <SectionHeader variant="sentence">{t('inventory:levelSection')}</SectionHeader>
      <View style={{ gap: 8, marginBottom: 22 }}>
        {levels.map(([value, label, icon]) => (
          <ChoiceCard
            key={label}
            title={label}
            leading={{ icon }}
            selected={marked.level === value}
            onPress={() => mark({ level: value })}
          />
        ))}
      </View>
      <SectionHeader variant="sentence">{t('inventory:filterType')}</SectionHeader>
      <View style={{ gap: 8 }}>
        <ChoiceCard
          title={t('inventory:filterTypeAll')}
          subtitle={t('inventory:itemCount', { count: types.total })}
          leading={{ icon: Layers }}
          selected={marked.typeSlug === undefined}
          onPress={() => mark({ typeSlug: undefined })}
        />
        {types.list.map((type) => (
          <ChoiceCard
            key={type.slug}
            title={type.name}
            subtitle={t('inventory:itemCount', { count: type.count })}
            leading={{ icon: Tag }}
            selected={type.slug === marked.typeSlug}
            onPress={() => mark({ typeSlug: type.slug })}
          />
        ))}
      </View>
    </SheetScaffold>
  )
}
