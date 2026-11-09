import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useAuthStore, type UserWarehouse } from '@/entities/session'
import { useWarehouseStore } from '@/entities/warehouse'
import { ListGroup, SearchField, SectionFooter, SectionHeader } from '@/shared/ui'

import { filterWarehouses, shouldShowSearch } from './filter-warehouses'
import { WarehouseCard } from './WarehouseCard'
import { WarehouseRow } from './WarehouseRow'

export type WarehouseListProps = {
  /** Kho mang dấu tích (đang chọn, hoặc đang được đánh dấu trong bảng đổi kho). */
  selectedSlug: string | undefined
  onPressWarehouse: (warehouse: UserWarehouse) => void
  /**
   * `grouped` (mặc định): nhóm kiểu "Cài đặt" iOS trên nền xám — màn chọn kho lần đầu.
   * `cards`: mỗi kho một ô bo tròn + vòng chọn, tiêu đề viết thường, ô tìm hình viên thuốc — bảng
   * đổi kho nền trắng (kiểu iOS 26/27).
   */
  variant?: 'grouped' | 'cards'
}

/**
 * Danh sách kho: CÙNG nguồn store kho đã resolve — ADMIN+ là mọi kho đã tải từ `GET /warehouses`
 * (`useWarehouseStore.warehouses`, có cả kho đã tắt → viên "Đã tắt"), vai trò khác là `user.warehouses`
 * của `/auth/me` (spec §7). Không tự gọi API.
 * Không tự cuộn: nơi gọi bọc trong `ScrollView` / `SheetScaffold`.
 * Nhóm kiểu "Cài đặt" iOS; ô tìm kiếm chỉ hiện khi có từ 6 kho. Chỉ hiển thị — bấm dòng làm gì là
 * việc của nơi gọi (chọn ngay, hoặc chỉ đánh dấu rồi bấm ✓).
 */
export function WarehouseList({
  selectedSlug,
  onPressWarehouse,
  variant = 'grouped',
}: WarehouseListProps) {
  const { t } = useTranslation(['auth'])
  const cards = variant === 'cards'
  const fetched = useWarehouseStore((s) => s.warehouses)
  const mine = useAuthStore((s) => s.user?.warehouses ?? EMPTY)
  const allWarehouses = fetched !== null
  const warehouses = fetched ?? mine
  const [query, setQuery] = useState('')
  const visible = filterWarehouses(warehouses, query)

  return (
    <View>
      {shouldShowSearch(warehouses.length) ? (
        <View style={{ marginBottom: 20 }}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder={t('auth:warehouseSearchPlaceholder')}
            shape={cards ? 'pill' : 'rounded'}
          />
        </View>
      ) : null}

      {cards ? (
        <SectionHeader variant="sentence">
          {t('auth:yourWarehouses', { count: warehouses.length })}
        </SectionHeader>
      ) : (
        <SectionHeader>{t('auth:warehouseCount', { count: warehouses.length })}</SectionHeader>
      )}
      {visible.length === 0 ? null : cards ? (
        <View style={{ gap: 8 }}>
          {visible.map((w) => (
            <WarehouseCard
              key={w.slug}
              warehouse={w}
              selected={w.slug === selectedSlug}
              allWarehouses={allWarehouses}
              onPress={() => onPressWarehouse(w)}
            />
          ))}
        </View>
      ) : (
        <ListGroup>
          {visible.map((w) => (
            <WarehouseRow
              key={w.slug}
              warehouse={w}
              selected={w.slug === selectedSlug}
              allWarehouses={allWarehouses}
              onPress={() => onPressWarehouse(w)}
            />
          ))}
        </ListGroup>
      )}
      {visible.length === 0 ? (
        <SectionFooter>{t('auth:warehouseSearchEmpty', { query: query.trim() })}</SectionFooter>
      ) : null}
      <SectionFooter>{t('auth:warehouseRememberHint')}</SectionFooter>
    </View>
  )
}

const EMPTY: UserWarehouse[] = []
