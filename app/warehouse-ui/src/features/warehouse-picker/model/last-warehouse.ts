const STORAGE_KEY = 'warehouse.lastWarehouse'

/**
 * Kho đang làm việc: `?warehouse` hợp lệ > kho nhớ lần trước (nếu còn trong danh sách) > kho đầu tiên.
 * Danh sách đã được backend lọc theo kho mình quản lý / là thành viên.
 */
export function resolveWarehouse(
  warehouses: { slug: string }[],
  requested: string | undefined,
  last: string | null,
): string | undefined {
  const has = (slug: string | null | undefined) =>
    slug !== null && slug !== undefined && warehouses.some((w) => w.slug === slug)
  if (has(requested)) return requested
  if (has(last)) return last ?? undefined
  return warehouses[0]?.slug
}

/** Tiện ích theo người xem — đọc / ghi hỏng (private mode, chặn storage) thì bỏ qua. */
export function recallWarehouse(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function rememberWarehouse(slug: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, slug)
  } catch {
    // Không lưu được thì lần sau chọn kho đầu tiên — không ảnh hưởng thao tác hiện tại.
  }
}
