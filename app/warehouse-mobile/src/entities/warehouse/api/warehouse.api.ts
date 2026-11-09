import type { UserWarehouse } from '@/entities/session'
import { getPaginated } from '@/shared/api/http'

/** Các trường app đọc của `WarehouseResponseDto` (`GET /warehouses`). */
type ApiWarehouse = {
  slug: string
  code: string
  name: string
  isActive: boolean
  manager?: { slug: string }
}

/** Backend không giới hạn `size` (`BaseQueryDto`); web lấy 1 trang 100 — ở đây đi hết các trang. */
const PAGE_SIZE = 100
/** Chặn vòng lặp vô hạn nếu server luôn báo `hasNext`. */
const MAX_PAGES = 50

/**
 * MỌI kho (ADMIN / SUPER_ADMIN — vai trò khác backend chỉ trả kho của mình), kể cả kho đã tắt: không
 * gửi `isActive` (DTO không đặt mặc định → không lọc). Đổi sang dạng kho của `/auth/me`
 * (`isManager` = quản lý là chính mình) và xếp theo tên như `/auth/me`.
 */
export async function fetchAllWarehouses(userSlug: string | undefined): Promise<UserWarehouse[]> {
  const rows: ApiWarehouse[] = []
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) throw new Error('warehouses: too many pages')
    const res = await getPaginated<ApiWarehouse>('/warehouses', { page, size: PAGE_SIZE })
    rows.push(...res.items)
    if (!res.hasNext) break
  }
  // Phân trang theo `createdAt DESC`: kho mới tạo giữa hai trang đẩy một dòng sang trang sau → trùng.
  const bySlug = new Map<string, ApiWarehouse>()
  for (const w of rows) if (!bySlug.has(w.slug)) bySlug.set(w.slug, w)
  return [...bySlug.values()]
    .map((w) => ({
      slug: w.slug,
      code: w.code,
      name: w.name,
      isManager: userSlug !== undefined && w.manager?.slug === userSlug,
      isActive: w.isActive,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.code.localeCompare(b.code))
}
