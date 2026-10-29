export type WarehouseDetailTab = 'materials' | 'members'

/**
 * `?tab=` → tab hợp lệ; `null` khi không tab nào hiện (trang chỉ còn Tổng quan). Vật tư cần MATERIAL_READ +
 * WAREHOUSE_READ; Thành viên cần `viewMembers`. Giá trị lạ / không có quyền → tab hợp lệ đầu tiên (Vật tư trước).
 */
export function resolveDetailTab(
  raw: string | null,
  visible: { materials: boolean; members: boolean },
): WarehouseDetailTab | null {
  if (raw === 'members' && visible.members) return 'members'
  if (visible.materials) return 'materials'
  return visible.members ? 'members' : null
}
