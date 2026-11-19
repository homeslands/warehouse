import { deleteData, getPaginated, patchData, postData, putData } from '@/shared/api/http'
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

/** Số lô CÒN HÀNG có hạn dùng trước `expiryBefore` (YYYY-MM-DD): xin 1 phần tử, đọc `total`. */
export const fetchBatchCount = async (
  warehouseSlug: string,
  expiryBefore: string,
): Promise<number> =>
  (
    await getPaginated<MaterialBatch>(`/warehouses/${warehouseSlug}/material-batches`, {
      page: 1,
      size: 1,
      status: 1,
      expiryBefore,
    })
  ).total

export const EXPIRING_PAGE_SIZE = 50

/** Một trang lô còn hàng có hạn dùng trước `expiryBefore`, hạn gần nhất trước. */
export const fetchExpiringBatches = (
  warehouseSlug: string,
  expiryBefore: string,
  page: number,
): Promise<Paginated<MaterialBatch>> =>
  getPaginated<MaterialBatch>(`/warehouses/${warehouseSlug}/material-batches`, {
    page,
    size: EXPIRING_PAGE_SIZE,
    status: 1,
    expiryBefore,
    sortBy: 'expiryDate',
    sort: 'ASC',
  })

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

/** Gắn vật tư vào kho. Ô ngưỡng vắng = dùng mặc định của vật tư; không gửi `quantity`. */
export type AssignBody = {
  materialSlug: string
  minimumInventory?: number
  maximumInventory?: number
}

export const assignMaterialToWarehouse = (
  warehouseSlug: string,
  body: AssignBody,
): Promise<InventoryItem> => putData<InventoryItem>(`/warehouses/${warehouseSlug}/materials`, body)

export const removeMaterialFromWarehouse = (
  warehouseSlug: string,
  materialSlug: string,
): Promise<void> => deleteData<void>(`/warehouses/${warehouseSlug}/materials/${materialSlug}`)

/**
 * `POST /warehouses/:w/materials` — tạo vật tư MỚI, gắn luôn vào kho và (nếu có) bên bán, cùng một
 * transaction. `material` đủ field của `POST /materials` (ngưỡng trong đó là mặc định của vật tư); không
 * gửi `quantity` hay ngưỡng riêng của kho.
 */
export type CreateInWarehouseBody = {
  material: {
    code: string
    name: string
    typeSlug: string
    baseUnitSlug: string
    minimumInventory?: number
    maximumInventory?: number
  }
  supplierSlug?: string
}

export const createMaterialInWarehouse = (
  warehouseSlug: string,
  body: CreateInWarehouseBody,
): Promise<InventoryItem> => postData<InventoryItem>(`/warehouses/${warehouseSlug}/materials`, body)
