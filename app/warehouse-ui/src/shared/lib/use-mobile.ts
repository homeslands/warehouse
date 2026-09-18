import * as React from 'react'

// Khớp breakpoint `md` của Tailwind: < 768px là mobile (sidebar thành ngăn trượt).
const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/**
 * Bản shadcn đọc `window.innerWidth` trong effect (render đầu luôn là desktop rồi mới đổi).
 * Đọc thẳng `matchMedia(...).matches` qua useSyncExternalStore: đúng ngay render đầu, và test
 * giả màn nhỏ chỉ cần giả `matchMedia`.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
