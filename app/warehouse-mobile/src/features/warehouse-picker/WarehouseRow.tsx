import { Check, Warehouse } from '@/shared/ui/icons'

import type { UserWarehouse } from '@/entities/session'
import { useTheme } from '@/shared/theme/useTheme'
import { ListRow } from '@/shared/ui'

import { WarehouseSubtitle, useWarehouseTags } from './warehouse-tags'

export type WarehouseRowProps = {
  warehouse: UserWarehouse
  selected: boolean
  onPress: () => void
  /** Danh sách MỌI kho (ADMIN+): không gắn chip "Thành viên". */
  allWarehouses?: boolean
}

/**
 * Một kho: ô icon (đen nếu đang chọn), tên, mã + chip vai trò (+ viên "Đã tắt"), dấu tích cho kho
 * đang chọn.
 */
export function WarehouseRow({
  warehouse,
  selected,
  onPress,
  allWarehouses = false,
}: WarehouseRowProps) {
  const { colors } = useTheme()
  const { role, inactive, accessibilityLabel } = useWarehouseTags(warehouse, allWarehouses)
  return (
    <ListRow
      icon={Warehouse}
      tone={selected ? 'solid' : 'light'}
      label={warehouse.name}
      selected={selected}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      subtitle={<WarehouseSubtitle warehouse={warehouse} role={role} inactive={inactive} />}
      trailing={selected ? <Check size={18} color={colors.foreground} aria-hidden /> : null}
    />
  )
}
