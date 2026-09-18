import { describe, expect, it } from 'vitest'
import { resolveApiProxy } from './api-proxy'

describe('resolveApiProxy', () => {
  it('có target → proxy /api tới target, bỏ "/" cuối, không rewrite path', () => {
    expect(
      resolveApiProxy(
        { VITE_API_BASE_URL: '/api/v1', VITE_API_PROXY_TARGET: 'http://localhost:8085/' },
        { mode: 'development', command: 'serve' },
      ),
    ).toEqual({ '/api': { target: 'http://localhost:8085', changeOrigin: true } })
  })

  it('base URL tuyệt đối, không target → không proxy (tương thích .env cũ)', () => {
    expect(
      resolveApiProxy(
        { VITE_API_BASE_URL: 'https://sandbox.example/api/v1' },
        { mode: 'development', command: 'serve' },
      ),
    ).toBeUndefined()
  })

  it('base URL tương đối mà thiếu target → ném lỗi nêu tên biến', () => {
    expect(() =>
      resolveApiProxy(
        { VITE_API_BASE_URL: '/api/v1', VITE_API_PROXY_TARGET: '  ' },
        { mode: 'development', command: 'serve' },
      ),
    ).toThrow(/VITE_API_PROXY_TARGET/)
  })

  it('base URL tương đối không bắt đầu bằng /api → ném lỗi (proxy chỉ bắt /api)', () => {
    expect(() =>
      resolveApiProxy(
        { VITE_API_BASE_URL: '/v1', VITE_API_PROXY_TARGET: 'http://localhost:8085' },
        { mode: 'development', command: 'serve' },
      ),
    ).toThrow(/\/api/)
  })

  it('mode test → không ném dù thiếu target', () => {
    expect(
      resolveApiProxy({ VITE_API_BASE_URL: '/api/v1' }, { mode: 'test', command: 'serve' }),
    ).toBeUndefined()
  })

  it('vite build (command build) → không ném dù thiếu target: production đặt sau reverse proxy', () => {
    expect(
      resolveApiProxy({ VITE_API_BASE_URL: '/api/v1' }, { mode: 'production', command: 'build' }),
    ).toBeUndefined()
  })

  it('vite preview (command serve, mode production) → vẫn ném khi thiếu target', () => {
    expect(() =>
      resolveApiProxy({ VITE_API_BASE_URL: '/api/v1' }, { mode: 'production', command: 'serve' }),
    ).toThrow(/VITE_API_PROXY_TARGET/)
  })
})
