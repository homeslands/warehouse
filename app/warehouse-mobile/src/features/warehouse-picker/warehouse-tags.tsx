import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { UserWarehouse } from '@/entities/session'
import { Badge, Text } from '@/shared/ui'

/**
 * Nhãn của một kho: vai trò ("Quản lý" / "Thành viên") và "Đã tắt". Danh sách MỌI kho của ADMIN+
 * (`allWarehouses`) không biết ai là thành viên → chỉ gắn "Quản lý" khi mình quản lý kho đó.
 */
export function useWarehouseTags(warehouse: UserWarehouse, allWarehouses: boolean) {
  const { t } = useTranslation(['auth'])
  const role = warehouse.isManager
    ? t('auth:warehouseRole.manager')
    : allWarehouses
      ? null
      : t('auth:warehouseRole.member')
  const inactive = warehouse.isActive === false ? t('auth:warehouseInactive') : null
  const accessibilityLabel = [warehouse.name, warehouse.code, role, inactive]
    .filter(Boolean)
    .join(', ')
  return { role, inactive, accessibilityLabel }
}

/** Dòng phụ: mã kho (code) + chip vai trò + viên "Đã tắt" (mờ). */
export function WarehouseSubtitle({
  warehouse,
  role,
  inactive,
  rolePill,
}: {
  warehouse: UserWarehouse
  role: string | null
  inactive: string | null
  /** Chip vai trò bo tròn hẳn (thẻ trong bảng đổi kho). */
  rolePill?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text code muted size={12} numberOfLines={1} style={{ flexShrink: 1 }}>
        {warehouse.code}
      </Text>
      {role ? (
        <Badge variant={warehouse.isManager ? 'solid' : 'neutral'} pill={rolePill}>
          {role}
        </Badge>
      ) : null}
      {inactive ? (
        <Badge variant="neutral" pill testID={`warehouse-inactive-${warehouse.slug}`}>
          {inactive}
        </Badge>
      ) : null}
    </View>
  )
}
