import { create } from 'zustand'

import type { UserWarehouse } from '@/entities/session'
import { kv } from '@/shared/storage/kv'

import { fetchAllWarehouses } from './api/warehouse.api'
import { resolveWarehouse } from './resolve-warehouse'

// Chỉ cần các trường này của CurrentUser (khai báo cấu trúc để không phụ thuộc runtime vào session).
type WarehouseUser = { userSlug?: string; userName: string; warehouses?: UserWarehouse[] }

/**
 * Nguồn danh sách kho: `mine` = `user.warehouses` của `/auth/me` (kho mình quản lý / là thành viên);
 * `all` = mọi kho từ `GET /warehouses` (ADMIN / SUPER_ADMIN). Nơi gọi (`session-wiring`) quyết định.
 */
export type WarehouseSource = 'mine' | 'all'

/** `error`: tải danh sách kho (nguồn `all`) lỗi — màn chọn kho báo lỗi + Thử lại (`retry`). */
export type Resolution = 'selected' | 'choose' | 'none' | 'error'

type WarehouseState = {
  current: UserWarehouse | null
  resolved: boolean
  resolution: Resolution | null
  /** Danh sách đã tải của nguồn `all` (null với nguồn `mine` — đọc `user.warehouses`). */
  warehouses: UserWarehouse[] | null
  /** Lỗi tải danh sách khi `resolution === 'error'`. */
  error: unknown
  resolveFor: (user: WarehouseUser, source?: WarehouseSource) => Promise<void>
  /** Chạy lại `resolveFor` gần nhất (sau lỗi tải, hoặc "Thử lại" ở màn chưa có kho). Hết phiên: không làm gì. */
  retry: () => Promise<void>
  /**
   * Nguồn `all`: tải lại danh sách IM LẶNG (quay lại app — lúc hồ sơ nạp lại). Kho đang chọn còn →
   * cập nhật nó (tên, `isActive`) và danh sách; không còn (bị xoá) hoặc chưa chọn → resolve lại theo
   * danh sách mới. Lỗi → giữ nguyên (không sang `error`). `select()` xen giữa thắng. Nguồn `mine`,
   * đang lỗi / chưa resolve, hết phiên: không làm gì. `user`: hồ sơ mới (cho `isManager`, `retry`).
   */
  revalidate: (user?: WarehouseUser) => Promise<void>
  select: (w: UserWarehouse) => Promise<void>
  reset: () => void
}

const keyFor = (user: WarehouseUser) => `warehouse.lastWarehouse.${user.userSlug ?? user.userName}`

// Tăng mỗi khi reset/resolveFor/select: kết quả async cũ không được ghi đè trạng thái mới.
let epoch = 0
// Tăng mỗi khi reset/resolveFor (KHÔNG khi select): danh sách tải về của yêu cầu cũ hết hiệu lực. Một
// `select()` xen giữa chỉ thắng phần lựa chọn — danh sách vừa tải vẫn được nhận.
let listEpoch = 0
// Khoá kv của user đang được resolve, dùng cho select().
let activeKey: string | null = null
// Lần resolveFor gần nhất, cho retry() / revalidate().
let lastRequest: { user: WarehouseUser; source: WarehouseSource } | null = null

const initial = {
  current: null,
  resolved: false,
  resolution: null,
  warehouses: null,
  error: null,
} as const

const sameWarehouse = (a: UserWarehouse, b: UserWarehouse) =>
  a.slug === b.slug &&
  a.code === b.code &&
  a.name === b.name &&
  a.isManager === b.isManager &&
  a.isActive === b.isActive

export const useWarehouseStore = create<WarehouseState>((set, get) => {
  /** Quyết định kho từ `list` + kho dùng lần trước, ghi state (và kv khi tự chọn). */
  async function settle(
    key: string,
    list: UserWarehouse[],
    last: string | null,
    fetched: UserWarehouse[] | null,
  ) {
    const result = resolveWarehouse(list, last)
    if (result.kind === 'selected') {
      set({
        current: result.warehouse,
        resolved: true,
        resolution: 'selected',
        warehouses: fetched,
        error: null,
      })
      if (last !== result.warehouse.slug) await kv.set(key, result.warehouse.slug)
    } else {
      set({
        current: null,
        resolved: true,
        resolution: result.kind,
        warehouses: fetched,
        error: null,
      })
    }
  }

  return {
    ...initial,

    async resolveFor(user, source = 'mine') {
      const mine = ++epoch
      const mineList = ++listEpoch
      const key = keyFor(user)
      activeKey = key
      lastRequest = { user, source }
      let loaded: [string | null, UserWarehouse[] | null]
      try {
        loaded = await Promise.all([
          kv.get<string>(key),
          source === 'all' ? fetchAllWarehouses(user.userSlug) : null,
        ])
      } catch (error) {
        // Chỉ `fetchAllWarehouses` ném được (`kv` nuốt lỗi). Đã chọn kho xen giữa → giữ lựa chọn.
        if (mine !== epoch) return
        set({ current: null, resolved: true, resolution: 'error', warehouses: null, error })
        return
      }
      if (mineList !== listEpoch) return
      const [last, fetched] = loaded
      if (mine !== epoch) {
        // `select()` xen giữa: lựa chọn thắng, nhưng giữ danh sách (bảng chọn không lùi về `/auth/me`).
        if (fetched) set({ warehouses: fetched })
        return
      }
      await settle(key, fetched ?? user.warehouses ?? [], last, fetched)
    },

    async retry() {
      if (!lastRequest) return
      await get().resolveFor(lastRequest.user, lastRequest.source)
    },

    async revalidate(user) {
      if (!lastRequest || lastRequest.source !== 'all' || !activeKey) return
      if (user) lastRequest = { user, source: 'all' }
      const { resolution } = get()
      if (resolution === null || resolution === 'error') return
      const mine = epoch
      const mineList = listEpoch
      const key = activeKey
      let fetched: UserWarehouse[]
      try {
        fetched = await fetchAllWarehouses(lastRequest.user.userSlug)
      } catch {
        return // việc nền: lần quay lại sau thử tiếp
      }
      if (mineList !== listEpoch) return
      if (mine !== epoch) {
        set({ warehouses: fetched })
        return
      }
      const { current } = get()
      const fresh = current ? fetched.find((w) => w.slug === current.slug) : undefined
      if (current && fresh) {
        set({ warehouses: fetched, ...(sameWarehouse(current, fresh) ? {} : { current: fresh }) })
        return
      }
      // Kho đang chọn đã bị xoá, hoặc chưa chọn (choose / none): resolve lại theo danh sách mới.
      const last = await kv.get<string>(key)
      if (mineList !== listEpoch) return
      if (mine !== epoch) {
        set({ warehouses: fetched })
        return
      }
      await settle(key, fetched, last, fetched)
    },

    async select(w) {
      const key = activeKey
      if (!key) throw new Error('select() before resolveFor')
      epoch++
      set({ current: w, resolved: true, resolution: 'selected' })
      await kv.set(key, w.slug)
    },

    reset() {
      epoch++
      listEpoch++
      activeKey = null
      lastRequest = null
      set({ ...initial })
    },
  }
})
