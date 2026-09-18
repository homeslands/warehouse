import { describe, expect, it } from 'vitest'
import { isNavActive } from './nav'

describe('isNavActive', () => {
  it('khớp đúng đường dẫn và mọi đường dẫn con', () => {
    expect(isNavActive('/materials', '/materials')).toBe(true)
    expect(isNavActive('/materials/abc', '/materials')).toBe(true)
    expect(isNavActive('/materials/abc/edit', '/materials')).toBe(true)
  })

  it('không khớp tiền tố "lửng" (/materials-types không thuộc /materials)', () => {
    expect(isNavActive('/materials-types', '/materials')).toBe(false)
    expect(isNavActive('/', '/materials')).toBe(false)
  })

  it('"/" chỉ khớp đúng "/"', () => {
    expect(isNavActive('/', '/')).toBe(true)
    expect(isNavActive('/examples', '/')).toBe(false)
  })
})
