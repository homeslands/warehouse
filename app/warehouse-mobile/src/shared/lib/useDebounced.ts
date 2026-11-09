import { useEffect, useState } from 'react'

const SEARCH_DEBOUNCE_MS = 300

/** Giá trị trễ 300ms; ô trống (xoá / đổi kho) áp dụng ngay để không vẽ khung với từ khoá cũ. */
export function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    if (value === '') return
    const id = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [value])
  return value === '' ? '' : debounced
}
