import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeSearchText } from './search-text'

describe('normalizeSearchText', () => {
  it('bỏ dấu, đổi đ → d, chữ thường, trim', () => {
    expect(normalizeSearchText('  Đà Nẵng ')).toBe('da nang')
    expect(normalizeSearchText('Bột GIẶT')).toBe('bot giat')
  })
})

describe('matchesSearch', () => {
  it('khớp không phân biệt dấu / hoa thường; chuỗi rỗng khớp mọi thứ', () => {
    expect(matchesSearch('NL04 · Bột giặt', 'bot gia')).toBe(true)
    expect(matchesSearch('NL04 · Bột giặt', 'nl04')).toBe(true)
    expect(matchesSearch('NL04 · Bột giặt', 'xi măng')).toBe(false)
    expect(matchesSearch('bất kỳ', '  ')).toBe(true)
  })
})
