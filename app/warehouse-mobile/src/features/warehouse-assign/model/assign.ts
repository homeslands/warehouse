import { assignMaterialToWarehouse, canEditThresholds } from '@/entities/inventory'
import type { Material, MaterialWarehouse } from '@/entities/material'
import { can, type CurrentUser, type UserWarehouse } from '@/entities/session'
import { isApiError } from '@/shared/api/http'

/** Gắn / gỡ vật tư cần cùng quyền với sửa ngưỡng (MATERIAL_UPDATE và WAREHOUSE_UPDATE). */
export const canAssignWarehouse = (user: CurrentUser | null): boolean => canEditThresholds(user)

/** Gắn vật tư vào bên bán (`PUT /suppliers/:slug/materials`): BE cần SUPPLIER_UPDATE + MATERIAL_UPDATE; đọc danh sách cần SUPPLIER_READ. */
export const canAttachSupplier = (user: CurrentUser | null): boolean =>
  can(user, 'SUPPLIER_READ') && can(user, 'SUPPLIER_UPDATE') && can(user, 'MATERIAL_UPDATE')

/**
 * Tạo vật tư mới ngay trong kho (`POST /warehouses/:w/materials`): BE cần MATERIAL_CREATE + MATERIAL_UPDATE +
 * WAREHOUSE_UPDATE; thêm UNIT_READ để chọn đơn vị gốc ở form.
 */
export const canCreateInWarehouse = (user: CurrentUser | null): boolean =>
  can(user, 'MATERIAL_CREATE') && can(user, 'UNIT_READ') && canAssignWarehouse(user)

export type WarehousePickState = 'pickable' | 'locked'

/**
 * Kho hiện trong bộ chọn: BỎ kho vật tư đã gắn; kho đã tắt → `locked` (hiện "Đã tắt", không tick
 * được); còn lại `pickable`. Giữ thứ tự đầu vào.
 */
export function warehousePickStates(
  all: readonly UserWarehouse[],
  material: Pick<Material, 'warehouses'>,
): { warehouse: UserWarehouse; state: WarehousePickState }[] {
  const have = new Set(material.warehouses.map((w) => w.slug))
  return all
    .filter((warehouse) => !have.has(warehouse.slug))
    .map((warehouse) => ({
      warehouse,
      state: warehouse.isActive === false ? 'locked' : 'pickable',
    }))
}

export type AssignFailReason = 'reassign' | 'notFound' | 'general'

export function classifyAssignError(e: unknown): AssignFailReason {
  if (!isApiError(e)) return 'general'
  if (e.code === 100802) return 'reassign'
  if (e.statusCode === 404) return 'notFound'
  return 'general'
}

export type AssignResult = {
  ok: string[]
  failed: { slug: string; reason: AssignFailReason; error: unknown }[]
  stale: boolean
}

/**
 * Gắn vật tư vào lần lượt từng kho (tuần tự, đúng thứ tự truyền vào; body chỉ `{ materialSlug }`).
 * Lỗi một kho không dừng các kho sau. `isStale()` (phiên đổi) kiểm trước và sau mỗi lần gọi → dừng, `stale`.
 */
export async function assignToWarehouses(
  materialSlug: string,
  warehouseSlugs: readonly string[],
  isStale: () => boolean,
): Promise<AssignResult> {
  const result: AssignResult = { ok: [], failed: [], stale: false }
  for (const slug of warehouseSlugs) {
    if (isStale()) return { ...result, stale: true }
    try {
      await assignMaterialToWarehouse(slug, { materialSlug })
      if (isStale()) return { ...result, stale: true }
      result.ok.push(slug)
    } catch (error) {
      if (isStale()) return { ...result, stale: true }
      result.failed.push({ slug, reason: classifyAssignError(error), error })
    }
  }
  return result
}

export type RemoveBlock = 'stock' | 'reserved' | null

/** Lý do không gỡ được: còn tồn (ưu tiên) hoặc còn hàng đang giữ chỗ. */
export function removeBlock(w: MaterialWarehouse): RemoveBlock {
  if (w.quantity > 0) return 'stock'
  if (w.quantity - w.availableQuantity > 0) return 'reserved'
  return null
}

export type RemoveErrorTarget = 'gone' | 'blocked' | 'general'

export function classifyRemoveError(e: unknown): RemoveErrorTarget {
  if (!isApiError(e)) return 'general'
  if (e.code === 100801 || e.statusCode === 404) return 'gone'
  if (e.code === 100807 || e.code === 100813) return 'blocked'
  return 'general'
}
