import { getPaginated, patchData } from '@/shared/api/http'
import type { Paginated } from '@/shared/api/types'
import type { InventoryHistory, InventoryItem, MaterialBatch } from '../model/types'
import { TOO_MANY_PAGES } from './inventory-error'

export type InventoryFilters = { belowMinimum?: boolean; aboveMaximum?: boolean }

const PAGE_SIZE = 100
/** Chặn vòng lặp vô hạn nếu server luôn báo `hasNext`. */
const MAX_PAGES = 50
export const HISTORY_PAGE_SIZE = 30

/** Tải lần lượt từng trang tới khi `hasNext=false`; lỗi bất kỳ trang nào thì cả lời gọi lỗi. */
async function fetchAllPages<T>(url: string, params: Record<string, unknown>): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await getPaginated<T>(url, { ...params, page, size: PAGE_SIZE })
    all.push(...res.items)
    if (!res.hasNext) return all
  }
  throw new Error(TOO_MANY_PAGES)
}

export const fetchAllInventory = (
  warehouseSlug: string,
  filters: InventoryFilters = {},
): Promise<InventoryItem[]> =>
  fetchAllPages<InventoryItem>(`/warehouses/${warehouseSlug}/materials`, { ...filters })

/**
 * Lô hạn gần nhất trước; lô không có hạn xuống cuối (server đặt NULL ở đầu khi ASC). Mặc định chỉ lô
 * còn hàng (`status=1`, tab Tồn kho); `inStockOnly: false` lấy cả lô hết hàng.
 */
export async function fetchMaterialBatches(
  warehouseSlug: string,
  materialSlug: string,
  { inStockOnly = true }: { inStockOnly?: boolean } = {},
): Promise<MaterialBatch[]> {
  const rows = await fetchAllPages<MaterialBatch>(`/warehouses/${warehouseSlug}/material-batches`, {
    materialSlug,
    status: inStockOnly ? 1 : undefined,
    sortBy: 'expiryDate',
    sort: 'ASC',
  })
  return [
    ...rows.filter((b) => b.expiryDate !== null),
    ...rows.filter((b) => b.expiryDate === null),
  ]
}

export const fetchInventoryHistory = (
  warehouseSlug: string,
  materialSlug: string,
  page: number,
): Promise<Paginated<InventoryHistory>> =>
  getPaginated<InventoryHistory>(
    `/warehouses/${warehouseSlug}/materials/${materialSlug}/histories`,
    { page, size: HISTORY_PAGE_SIZE, sort: 'DESC' },
  )

/** Ngưỡng riêng của kho. Trường vắng = giữ nguyên; `null` = bỏ ngưỡng riêng, dùng mặc định của vật tư. */
export type ThresholdPatch = { minimumInventory?: number | null; maximumInventory?: number | null }

export const updateInventoryThresholds = (
  warehouseSlug: string,
  materialSlug: string,
  body: ThresholdPatch,
): Promise<InventoryItem> =>
  patchData<InventoryItem>(`/warehouses/${warehouseSlug}/materials/${materialSlug}`, body)
