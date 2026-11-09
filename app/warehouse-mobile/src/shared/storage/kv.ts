import AsyncStorage from '@react-native-async-storage/async-storage'

// Bọc AsyncStorage: JSON in/out, không bao giờ ném lỗi ra ngoài (storage có thể hỏng).
export const kv = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key)
      return raw === null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  },

  async set(key: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value))
    } catch {
      // nuốt lỗi: mất cache cục bộ không được làm hỏng luồng chính
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key)
    } catch {
      // nuốt lỗi
    }
  },
}
