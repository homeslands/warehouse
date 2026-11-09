import {
  matchSuggestions,
  RECEIVER_SUGGESTIONS_MAX,
  type ExportFormType,
} from '@/entities/export-form'
import type { UserWarehouse } from '@/entities/session'
import { normalizeForSearch } from '@/shared/lib/search'

export type ReceiverSuggestion =
  | { kind: 'recent'; value: string }
  | { kind: 'warehouse'; value: string; code: string; slug: string }

const sameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Gợi ý cho ô Người nhận: người nhận gần đây của kho (`useRecentReceivers`, đã bỏ trùng, mới nhất trước)
 * lọc theo chữ đang gõ (tối đa 8); loại Chuyển kho thêm — TRƯỚC — các kho người dùng chọn được (ADMIN+:
 * mọi kho đã tải; còn lại: kho của mình) trừ kho hiện tại, khớp theo tên hoặc mã (tối đa 8). Người nhận
 * gần đây trùng tên một kho chỉ hiện một lần, dưới dạng kho. Mục đúng y chữ đang gõ không hiện.
 *
 * `query`: chữ dùng để LỌC (nơi gọi truyền `''` khi người dùng chưa gõ gì từ lúc focus — ô đã điền sẵn
 * vẫn thấy đủ gợi ý); `current`: giá trị đang có trong ô — không gợi ý lại chính nó.
 */
export function receiverSuggestions({
  recent,
  warehouses,
  type,
  currentSlug,
  query,
  current = query,
}: {
  recent: readonly string[]
  warehouses: readonly UserWarehouse[]
  type: ExportFormType
  currentSlug: string | undefined
  query: string
  current?: string
}): ReceiverSuggestion[] {
  const targets = type === 'TRANSFER' ? warehouses.filter((w) => w.slug !== currentSlug) : []
  const q = normalizeForSearch(query)
  const whItems: ReceiverSuggestion[] = targets
    .filter((w) => {
      const name = normalizeForSearch(w.name)
      if (q !== '' && name === q) return false
      return name.includes(q) || normalizeForSearch(w.code).includes(q)
    })
    .slice(0, RECEIVER_SUGGESTIONS_MAX)
    .map((w) => ({ kind: 'warehouse', value: w.name, code: w.code, slug: w.slug }))
  const warehouseNames = new Set(targets.map((w) => sameKey(w.name)))
  const recentItems: ReceiverSuggestion[] = matchSuggestions(
    recent.filter((r) => !warehouseNames.has(sameKey(r))),
    query,
  ).map((value) => ({ kind: 'recent', value }))
  const cur = normalizeForSearch(current)
  return [...whItems, ...recentItems].filter((s) => normalizeForSearch(s.value) !== cur)
}
