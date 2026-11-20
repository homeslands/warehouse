import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

import { kv } from '@/shared/storage/kv'

export const WELCOME_SEEN_KEY = 'warehouse.welcomeSeen'

/**
 * Máy này đã xem màn chào chưa (theo máy, không theo tài khoản — đăng xuất không xoá).
 * `null` = chưa nạp (trước `initWelcome`).
 */
export const useWelcome = create<{ seen: boolean | null }>(() => ({ seen: null }))

/**
 * Gọi một lần lúc khởi động (trong lúc còn splash). Chỉ "chưa có cờ" mới là chưa xem; đọc lỗi / giá trị
 * hỏng coi như đã xem để màn chào không bao giờ chặn đường tới đăng nhập. Đọc thẳng AsyncStorage vì
 * `kv.get` nuốt lỗi thành `null`, không phân biệt được với "chưa có".
 */
export async function initWelcome(): Promise<void> {
  let raw: string | null
  try {
    raw = await AsyncStorage.getItem(WELCOME_SEEN_KEY)
  } catch {
    raw = 'error'
  }
  useWelcome.setState({ seen: raw !== null })
}

/** Đánh dấu đã xem: đổi state ngay (điều hướng không chờ ghi), rồi lưu. Gọi lại vô hại. */
export async function markWelcomeSeen(): Promise<void> {
  useWelcome.setState({ seen: true })
  await kv.set(WELCOME_SEEN_KEY, true)
}
