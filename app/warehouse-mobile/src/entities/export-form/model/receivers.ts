import { normalizeForSearch } from '@/shared/lib/search'

/** Số gợi ý tối đa (người nhận gần đây). */
export const RECEIVER_SUGGESTIONS_MAX = 8

/** So trùng người nhận: không phân biệt hoa thường, bỏ khoảng trắng thừa (GIỮ dấu — "Bếp" ≠ "Bep"). */
const sameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Người nhận khác nhau của các phiếu, phiếu mới nhất trước (`createdAt`); trùng (không phân biệt hoa
 * thường / khoảng trắng thừa) thì giữ cách viết của phiếu mới nhất; bỏ người nhận rỗng.
 */
export function recentReceivers(
  forms: readonly { receiver: string; createdAt: string }[],
): string[] {
  const sorted = [...forms].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const seen = new Set<string>()
  const out: string[] = []
  for (const { receiver } of sorted) {
    const key = sameKey(receiver ?? '')
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push(receiver.trim())
  }
  return out
}

/**
 * Gợi ý khớp chữ đang gõ (bỏ dấu, không phân biệt hoa thường; ô trống = tất cả), giữ thứ tự, tối đa
 * `max`. Mục đúng y chữ đang gõ bị bỏ (gợi ý lại chính nó là vô ích).
 */
export function matchSuggestions(
  values: readonly string[],
  query: string,
  max = RECEIVER_SUGGESTIONS_MAX,
): string[] {
  const q = normalizeForSearch(query)
  return values
    .filter((v) => {
      const n = normalizeForSearch(v)
      return n.includes(q) && (q === '' || n !== q)
    })
    .slice(0, max)
}
