import { Warehouse } from '@/shared/ui/icons'

import type { UserWarehouse } from '@/entities/session'
import { ChoiceCard } from '@/shared/ui'

import { WarehouseSubtitle, useWarehouseTags } from './warehouse-tags'

export type WarehouseCardProps = {
  warehouse: UserWarehouse
  selected: boolean
  onPress: () => void
  /** Danh sách MỌI kho (ADMIN+): không gắn chip "Thành viên". */
  allWarehouses?: boolean
}

/** Một kho trong sheet đổi kho: `ChoiceCard` với icon kho, mã (code) + chip vai trò (+ "Đã tắt"). */
export function WarehouseCard({
  warehouse,
  selected,
  onPress,
  allWarehouses = false,
}: WarehouseCardProps) {
  const { role, inactive, accessibilityLabel } = useWarehouseTags(warehouse, allWarehouses)
  return (
    <ChoiceCard
      testID={`warehouse-card-${warehouse.slug}`}
      title={warehouse.name}
      accessibilityLabel={accessibilityLabel}
      leading={{ icon: Warehouse }}
      selected={selected}
      onPress={onPress}
      subtitle={
        <WarehouseSubtitle warehouse={warehouse} role={role} inactive={inactive} rolePill />
      }
    />
  )
}
