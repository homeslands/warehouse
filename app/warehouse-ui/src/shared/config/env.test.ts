import { describe, expect, it } from 'vitest'
import { readEnv } from '@/shared/config/env'

describe('readEnv', () => {
  it('trả về apiBaseUrl khi biến hợp lệ', () => {
    expect(readEnv({ VITE_API_BASE_URL: 'http://localhost:8085/api/v1' })).toEqual({
      apiBaseUrl: 'http://localhost:8085/api/v1',
    })
  })

  it('cắt dấu / thừa ở cuối', () => {
    expect(readEnv({ VITE_API_BASE_URL: 'http://x/api/v1/' }).apiBaseUrl).toBe('http://x/api/v1')
  })

  it('ném lỗi nêu đích danh biến thiếu', () => {
    expect(() => readEnv({})).toThrow(/VITE_API_BASE_URL/)
  })

  it('ném lỗi khi biến là chuỗi rỗng', () => {
    expect(() => readEnv({ VITE_API_BASE_URL: '  ' })).toThrow(/VITE_API_BASE_URL/)
  })
})
