import { describe, expect, it } from 'vitest'
import { DEFAULT_AFTER_LOGIN, safeRedirect } from './safe-redirect'

describe('safeRedirect', () => {
  it.each([
    ['/examples?page=3', '/examples?page=3'],
    ['/examples#top', '/examples#top'],
    ['/', '/'],
  ])('chấp nhận đường dẫn nội bộ %s', (raw, expected) => {
    expect(safeRedirect(raw)).toBe(expected)
  })

  it.each([
    [null],
    [undefined],
    [''],
    ['examples'],
    ['//evil.com'],
    ['/\\evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['/login'],
    ['/login?redirect=/examples'],
  ])('từ chối %s → về mặc định', (raw) => {
    expect(safeRedirect(raw)).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('mặc định sau đăng nhập là trang Tổng quan `/` (Example chỉ có khi dev)', () => {
    expect(safeRedirect(null)).toBe('/')
    expect(DEFAULT_AFTER_LOGIN).toBe('/')
  })

  it('dùng fallback được truyền vào', () => {
    expect(safeRedirect('//evil.com', '/khac')).toBe('/khac')
  })
})
