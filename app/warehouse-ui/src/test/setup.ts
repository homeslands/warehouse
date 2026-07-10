import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import i18n from '@/shared/i18n'
import { server } from './msw'

// Test khẳng định thứ người dùng THẤY (chuỗi tiếng Việt), nên ghim ngôn ngữ.
// Không có dòng này, LanguageDetector đọc navigator.language ('en-US' trong jsdom) và chọn 'en'.
await i18n.changeLanguage('vi')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())
