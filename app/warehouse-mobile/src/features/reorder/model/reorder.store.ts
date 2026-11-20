import { create } from 'zustand'

import type { InventoryItem } from '@/entities/inventory'
import { getSessionEpoch } from '@/entities/session'
import { todayLocalIso } from '@/shared/lib/format'
import { kv } from '@/shared/storage/kv'

import { MARK_TTL_DAYS, reorderLevel, type ReorderLocal, type ReorderQty } from './reorder'

/** Khoá AsyncStorage của phần lưu trên máy — riêng từng người dùng + kho. */
export const reorderStorageKey = (userSlug: string, warehouseSlug: string) =>
  `reorder.v1.${userSlug}.${warehouseSlug}`

/** Ngày hôm nay theo giờ máy, `yyyy-MM-dd` (dùng cho `orderedAt`). */
export function todayKey(d?: Date): string {
  return todayLocalIso(d ?? new Date())
}

const DAY_MS = 86_400_000

/** `yyyy-MM-dd` → số ngày (UTC, không dính giờ mùa hè); sai dạng → `NaN`. */
function dayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS : NaN
}

const isEmpty = (entry: ReorderLocal) =>
  entry.qty === undefined && entry.supplierSlug === undefined && entry.orderedAt === undefined

/**
 * Dọn phần lưu trên máy theo danh sách tồn vừa tải:
 * - vật tư không còn trong `items` → bỏ cả mục (kể cả nơi đặt);
 * - vật tư ra khỏi danh sách cần đặt (`reorderLevel(item) === null`: tồn > Min × 1,2 hoặc Min ≤ 0) →
 *   xoá `qty` + `orderedAt` (vật tư vàng GIỮ dấu);
 * - `orderedAt` cũ hơn `MARK_TTL_DAYS` ngày (đúng 7 ngày vẫn giữ) hoặc sai dạng → xoá `orderedAt` + `qty`;
 * - `supplierSlug` không bao giờ hết hạn ở đây. Mục rỗng thì bỏ.
 * Không đổi gì → trả đúng object `local` (để nơi gọi bỏ qua việc ghi).
 */
export function pruneLocal(
  local: Record<string, ReorderLocal>,
  items: InventoryItem[],
  today: string,
): Record<string, ReorderLocal> {
  const bySlug = new Map(items.map((it) => [it.materialSlug, it]))
  const todayN = dayNumber(today)
  const next: Record<string, ReorderLocal> = {}
  let changed = false

  for (const [slug, entry] of Object.entries(local)) {
    const it = bySlug.get(slug)
    if (!it) {
      changed = true
      continue
    }
    const outOfList = reorderLevel(it) === null
    const expired =
      entry.orderedAt !== undefined &&
      Number.isFinite(todayN) &&
      !(todayN - dayNumber(entry.orderedAt) <= MARK_TTL_DAYS)
    if ((outOfList || expired) && (entry.qty !== undefined || entry.orderedAt !== undefined)) {
      changed = true
      const { qty: _qty, orderedAt: _orderedAt, ...rest } = entry
      if (!isEmpty(rest)) next[slug] = rest
      continue
    }
    next[slug] = entry
  }
  return changed ? next : local
}

export type ReorderStore = {
  /** `${userSlug}|${warehouseSlug}` đang nạp / đã nạp; `null` = chưa nạp gì. */
  scope: string | null
  /** Khoá = `materialSlug`. */
  local: Record<string, ReorderLocal>
  /** `false` khi đang đọc kv của `scope` — lúc này mọi lệnh ghi bị bỏ qua. */
  loaded: boolean
  /**
   * Nạp phần lưu của người dùng + kho. Đổi scope → `local` về rỗng NGAY (không lộ dữ liệu kho/người cũ)
   * rồi đọc kv; kết quả bị bỏ nếu đã có lần nạp khác sau đó hoặc phiên đổi (`getSessionEpoch`).
   * Gọi lại cùng scope trong cùng phiên → không làm gì (không xoá dữ liệu đang có).
   */
  load(userSlug: string, warehouseSlug: string): Promise<void>
  /** `null` = bỏ số đã sửa (quay về số gợi ý). */
  setQty(materialSlug: string, qty: ReorderQty | null): void
  setSupplier(materialSlug: string, supplierSlug: string): void
  /** `today` = `todayKey()`. */
  markOrdered(materialSlugs: string[], today: string): void
  unmarkOrdered(materialSlug: string): void
  /**
   * Dọn theo `pruneLocal`, chỉ ghi kv khi có thay đổi.
   *
   * CHỈ gọi với danh sách tồn ĐÃ TẢI THÀNH CÔNG của đúng kho đang nạp — không gọi khi đang tải, lỗi
   * hay với mảng giữ chỗ: `items = []` hợp lệ nghĩa là "kho không còn vật tư nào" và sẽ xoá sạch mọi
   * mục (kể cả nơi đặt đã chọn).
   */
  prune(items: InventoryItem[], today: string): void
}

/** Lần nạp gần nhất: chặn kết quả trễ và lệnh ghi sau khi phiên đổi. */
let active: { scope: string; key: string; epoch: number; seq: number } | null = null
let loadSeq = 0
let inflight: Promise<void> | null = null

/** Dữ liệu kv có thể hỏng: chỉ giữ trường đúng kiểu. */
function sanitize(raw: unknown): Record<string, ReorderLocal> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, ReorderLocal> = {}
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const entry: ReorderLocal = {}
    const qty = v.qty as Record<string, unknown> | undefined
    if (qty && typeof qty.value === 'number' && typeof qty.unitSlug === 'string') {
      entry.qty = { value: qty.value, unitSlug: qty.unitSlug }
    }
    if (typeof v.supplierSlug === 'string') entry.supplierSlug = v.supplierSlug
    if (typeof v.orderedAt === 'string') entry.orderedAt = v.orderedAt
    if (!isEmpty(entry)) out[slug] = entry
  }
  return out
}

/** Sửa một mục; mục rỗng thì bỏ. */
function patchEntry(
  local: Record<string, ReorderLocal>,
  slug: string,
  patch: (entry: ReorderLocal) => ReorderLocal,
): Record<string, ReorderLocal> {
  const entry = patch({ ...local[slug] })
  const next = { ...local }
  if (isEmpty(entry)) delete next[slug]
  else next[slug] = entry
  return next
}

/**
 * Phần lưu trên máy của màn "Đề xuất đặt hàng": số đã sửa, nơi đặt đã chọn, dấu đã đặt. Khoá theo
 * `userSlug|warehouseSlug`; mỗi lần ghi lưu kv (không chờ). Ghi khi chưa nạp xong / sau khi phiên đổi
 * → bỏ qua (không ghi đè dữ liệu chưa đọc, không ghi vào khoá của phiên cũ).
 */
export const useReorderStore = create<ReorderStore>((set, get) => {
  const write = (fn: (local: Record<string, ReorderLocal>) => Record<string, ReorderLocal>) => {
    const { scope, loaded, local } = get()
    if (!scope || !loaded || !active || active.scope !== scope) return
    if (active.epoch !== getSessionEpoch()) return
    const next = fn(local)
    if (next === local) return
    set({ local: next })
    void kv.set(active.key, next)
  }

  return {
    scope: null,
    local: {},
    loaded: false,

    load(userSlug, warehouseSlug) {
      const scope = `${userSlug}|${warehouseSlug}`
      const epoch = getSessionEpoch()
      if (get().scope === scope && active?.scope === scope && active.epoch === epoch) {
        return inflight ?? Promise.resolve()
      }
      const seq = ++loadSeq
      const key = reorderStorageKey(userSlug, warehouseSlug)
      active = { scope, key, epoch, seq }
      set({ scope, local: {}, loaded: false })

      const request = kv.get<unknown>(key).then((raw) => {
        if (active?.seq !== seq || get().scope !== scope || getSessionEpoch() !== epoch) return
        set({ local: sanitize(raw), loaded: true })
      })
      inflight = request
      void request.finally(() => {
        if (inflight === request) inflight = null
      })
      return request
    },

    setQty: (materialSlug, qty) =>
      write((local) =>
        patchEntry(local, materialSlug, (e) => {
          if (qty) e.qty = { value: qty.value, unitSlug: qty.unitSlug }
          else delete e.qty
          return e
        }),
      ),

    setSupplier: (materialSlug, supplierSlug) =>
      write((local) => patchEntry(local, materialSlug, (e) => ({ ...e, supplierSlug }))),

    markOrdered: (materialSlugs, today) =>
      write((local) =>
        materialSlugs.reduce(
          (acc, slug) => patchEntry(acc, slug, (e) => ({ ...e, orderedAt: today })),
          local,
        ),
      ),

    unmarkOrdered: (materialSlug) =>
      write((local) =>
        patchEntry(local, materialSlug, (e) => {
          delete e.orderedAt
          return e
        }),
      ),

    prune: (items, today) => write((local) => pruneLocal(local, items, today)),
  }
})
