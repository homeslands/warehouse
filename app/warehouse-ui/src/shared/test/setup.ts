import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import i18n from '@/shared/i18n'
import { server } from './msw'

// Test khẳng định thứ người dùng THẤY (chuỗi tiếng Việt), nên ghim ngôn ngữ.
// Không có dòng này, LanguageDetector đọc navigator.language ('en-US' trong jsdom) và chọn 'en'.
await i18n.changeLanguage('vi')

// jsdom không cài đặt matchMedia. next-themes (enableSystem) gọi nó ngay khi mount.
// next-themes 0.4.6 dùng API MediaQueryList cũ (addListener/removeListener) chứ không
// phải addEventListener/removeEventListener chuẩn hiện đại. Trình duyệt thật vẫn giữ hai
// alias đã deprecated này nên không lộ vấn đề ở đó — chỉ lộ trong jsdom, nơi mock này phải
// tự khai báo đầy đủ cả hai bộ API.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// jsdom không cài đặt ResizeObserver. cmdk (CommandList của Combobox) tạo một cái ngay khi mount
// để đo chiều cao danh sách → thiếu thì test Combobox chết với "ResizeObserver is not defined".
// Không cần đo thật trong test nên stub rỗng là đủ.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom không cài đặt scrollIntoView. cmdk gọi nó mỗi khi đổi mục đang chọn (mở danh sách, gõ lọc,
// phím mũi tên) → thiếu thì "e.scrollIntoView is not a function".
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear()
})
afterAll(() => server.close())
