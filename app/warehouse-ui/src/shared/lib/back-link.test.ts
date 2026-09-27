import { describe, expect, it } from 'vitest'
import { readBackTo } from './back-link'

describe('readBackTo', () => {
  it('không có state → về danh sách gốc', () => {
    expect(readBackTo(undefined, '/warehouses')).toBe('/warehouses')
    expect(readBackTo(null, '/warehouses')).toBe('/warehouses')
  })

  it('giữ đúng trang và bộ lọc người dùng vừa rời', () => {
    expect(readBackTo({ backTo: '/warehouses?page=2&isActive=false' }, '/warehouses')).toBe(
      '/warehouses?page=2&isActive=false',
    )
  })

  it('từ chối đường dẫn ngoài danh sách của chính màn này', () => {
    expect(readBackTo({ backTo: '/stores' }, '/warehouses')).toBe('/warehouses')
    expect(readBackTo({ backTo: 'https://evil.example' }, '/warehouses')).toBe('/warehouses')
    expect(readBackTo({ backTo: '/warehouses-x' }, '/warehouses')).toBe('/warehouses')
    expect(readBackTo({ backTo: 42 }, '/warehouses')).toBe('/warehouses')
  })
})
