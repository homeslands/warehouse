import { getPaginated } from './http'

export const TOO_MANY_PAGES_ERROR = 'too-many-pages'

const PAGE_SIZE = 100
/** Chặn vòng lặp vô hạn nếu server luôn báo `hasNext`. */
const MAX_PAGES = 50

/**
 * Tải lần lượt từng trang tới khi `hasNext=false` hoặc chạm trần `MAX_PAGES` (khi đó `truncated: true`
 * kèm phần đã tải, không ném lỗi); lỗi bất kỳ trang nào thì cả lời gọi lỗi. `signal` (react-query huỷ query
 * bị bỏ) đã huỷ thì không gọi thêm trang nào (ném lý do huỷ).
 */
export async function fetchPagesUpToCap<T>(
  url: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    signal?.throwIfAborted()
    const res = await getPaginated<T>(url, { ...params, page, size: PAGE_SIZE }, signal)
    items.push(...res.items)
    if (!res.hasNext) return { items, truncated: false }
  }
  return { items, truncated: true }
}

/** Tải lần lượt từng trang tới khi `hasNext=false`; lỗi bất kỳ trang nào / quá `MAX_PAGES` thì cả lời gọi lỗi. */
export async function fetchAllPages<T>(
  url: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const { items, truncated } = await fetchPagesUpToCap<T>(url, params)
  if (truncated) throw new Error(TOO_MANY_PAGES_ERROR)
  return items
}
