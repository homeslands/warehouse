import { vi } from 'vitest'

/**
 * Giả màn hẹp (< 768px): `ListToolbar` đổi sang hàng chip có nút "Xoá bộ lọc" đứng ngoài popover.
 * Gọi trong test; `vi.restoreAllMocks()` / `restoreMocks` của vitest trả lại `matchMedia` gốc.
 */
export function mockMobileViewport() {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}
