/**
 * Tuần tự hoá `POST /auth/refresh` GIỮA CÁC TAB.
 *
 * BE Q3 (#197, 07/11/2026): KHÔNG có grace window — hai tab gửi cùng một refresh cookie thì lần thứ
 * hai bị coi là reuse ⇒ revoke cả family/phiên (business-rules §Auth: rotation + reuse-revoke). Nên
 * single-flight giữa tab là BẮT BUỘC:
 * 1. Ưu tiên Web Locks (`navigator.locks`) — nguyên tử, trình duyệt tự nhả khi tab chết.
 * 2. Không có Web Locks: mutex trên localStorage + BroadcastChannel, có hạn (TTL) để tab chết giữa
 *    chừng không treo các tab khác. localStorage không có compare-and-swap: ghi rồi đợi một nhịp và đọc
 *    lại để xác nhận còn là chủ — đủ cho tương tác người dùng (hai tab refresh trong cùng vài ms rất
 *    hiếm); nếu vẫn reuse thì server revoke và client kết thúc phiên ("revoked").
 */

export const V1_REFRESH_LOCK = 'warehouse.auth.v1.refresh'
export const V1_REFRESH_MUTEX_KEY = 'warehouse.auth.v1.refresh-lock'
export const V1_REFRESH_CHANNEL = 'warehouse.auth.v1'

/** Lớn hơn timeout refresh (15 giây) để chủ đang chờ server không bị tab khác giành mất. */
export const V1_REFRESH_MUTEX_TTL_MS = 20_000

type Holder = { owner: string; expiresAt: number }

export type StorageMutexOptions = {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  tabId?: string
  now?: () => number
  ttlMs?: number
  /** Chờ sau khi ghi để mọi ghi đồng thời kịp đè, rồi mới đọc lại xác nhận. */
  settleMs?: number
  /** Khoảng kiểm lại khi không nhận được tín hiệu nhả khoá. */
  pollMs?: number
  /** Tạo kênh báo nhả khoá; `null` = không có BroadcastChannel (chỉ dựa `storage` event + poll). */
  createChannel?: (() => BroadcastChannel) | null
}

function newTabId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Mutex localStorage + BroadcastChannel. Trả hàm `run(task)` chạy `task` khi giữ khoá. */
export function createStorageMutex({
  storage = localStorage,
  tabId = newTabId(),
  now = Date.now,
  ttlMs = V1_REFRESH_MUTEX_TTL_MS,
  settleMs = 30,
  pollMs = 250,
  createChannel = typeof BroadcastChannel === 'undefined'
    ? null
    : () => new BroadcastChannel(V1_REFRESH_CHANNEL),
}: StorageMutexOptions = {}) {
  function readHolder(): Holder | null {
    try {
      const value: unknown = JSON.parse(storage.getItem(V1_REFRESH_MUTEX_KEY) ?? 'null')
      if (typeof value !== 'object' || value === null) return null
      const { owner, expiresAt } = value as Record<string, unknown>
      if (typeof owner !== 'string' || typeof expiresAt !== 'number') return null
      return { owner, expiresAt }
    } catch {
      return null
    }
  }

  /** Đợi tín hiệu nhả khoá (BroadcastChannel / storage event) hoặc hết `pollMs`. */
  function waitForRelease(): Promise<void> {
    return new Promise((resolve) => {
      const channel = createChannel?.() ?? null
      const done = () => {
        clearTimeout(timer)
        window.removeEventListener('storage', onStorage)
        channel?.close()
        resolve()
      }
      const onStorage = (event: StorageEvent) => {
        if (event.key === V1_REFRESH_MUTEX_KEY || event.key === null) done()
      }
      const timer = setTimeout(done, pollMs)
      window.addEventListener('storage', onStorage)
      if (channel) channel.onmessage = () => done()
    })
  }

  async function acquire(): Promise<void> {
    for (;;) {
      const held = readHolder()
      if (held === null || held.expiresAt <= now() || held.owner === tabId) {
        storage.setItem(
          V1_REFRESH_MUTEX_KEY,
          JSON.stringify({ owner: tabId, expiresAt: now() + ttlMs }),
        )
        await sleep(settleMs)
        if (readHolder()?.owner === tabId) return
      }
      await waitForRelease()
    }
  }

  function release(): void {
    // Hết hạn và tab khác đã giành thì không xoá khoá của họ.
    if (readHolder()?.owner === tabId) storage.removeItem(V1_REFRESH_MUTEX_KEY)
    const channel = createChannel?.() ?? null
    channel?.postMessage('released')
    channel?.close()
  }

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire()
    try {
      return await task()
    } finally {
      release()
    }
  }
}

let fallbackMutex: ReturnType<typeof createStorageMutex> | null = null

/** Web Locks nếu có, ngược lại mutex localStorage + BroadcastChannel. */
export async function withCrossTabRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks) return await locks.request(V1_REFRESH_LOCK, task)
  fallbackMutex ??= createStorageMutex()
  return fallbackMutex(task)
}
