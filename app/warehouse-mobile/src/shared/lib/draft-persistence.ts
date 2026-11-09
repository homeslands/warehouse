import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native'

import { kv } from '@/shared/storage/kv'

export type DraftSnapshot = { key: string; value: unknown }

export type DraftPersistence = {
  /** Hẹn ghi (debounce); mỗi lần gọi đặt lại bộ đếm. */
  schedule: () => void
  /** Ghi ngay bản đang chờ (nếu có). */
  flush: () => Promise<void>
  /** Huỷ ghi đang chờ. */
  cancel: () => void
  /** Đăng ký ghi nốt khi app xuống nền / inactive (một lần). */
  ensureAppStateSync: () => void
  /** Gỡ lắng nghe `AppState` và huỷ ghi đang chờ. Dùng ở teardown của test. */
  stop: () => void
}

/**
 * Ghi bản nháp lên `kv` có debounce + ghi nốt khi app xuống nền, dùng chung cho các store bản nháp
 * (nhập / xuất). `snapshot` đọc store tại thời điểm ghi; trả `null` thì không ghi gì.
 */
export function createDraftPersistence(
  snapshot: () => DraftSnapshot | null,
  debounceMs = 300,
): DraftPersistence {
  let timer: ReturnType<typeof setTimeout> | null = null
  let appStateSub: NativeEventSubscription | null = null

  function cancel() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function flush(): Promise<void> {
    if (timer === null) return Promise.resolve()
    cancel()
    const snap = snapshot()
    return snap ? kv.set(snap.key, snap.value) : Promise.resolve()
  }

  return {
    schedule() {
      cancel()
      timer = setTimeout(() => void flush(), debounceMs)
    },
    flush,
    cancel,
    ensureAppStateSync() {
      if (appStateSub) return
      appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
        if (next === 'background' || next === 'inactive') void flush()
      })
    },
    stop() {
      appStateSub?.remove()
      appStateSub = null
      cancel()
    },
  }
}
