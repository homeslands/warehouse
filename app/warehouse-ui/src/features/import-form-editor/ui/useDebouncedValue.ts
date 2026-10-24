import { useEffect, useState } from 'react'

/** Giá trị trễ `ms` sau lần đổi cuối — ô tìm vật tư gọi BE sau khi người dùng ngừng gõ. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}
