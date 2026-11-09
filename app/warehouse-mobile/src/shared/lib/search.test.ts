import { normalizeForSearch } from './search'

describe('normalizeForSearch', () => {
  it('bỏ dấu tiếng Việt, đ → d, chữ thường', () => {
    expect(normalizeForSearch('Kho Thủ Đức')).toBe('kho thu duc')
    expect(normalizeForSearch('ĐÀ NẴNG')).toBe('da nang')
    expect(normalizeForSearch('ádas')).toBe('adas')
  })

  it('cắt khoảng trắng hai đầu', () => {
    expect(normalizeForSearch('  Kho  ')).toBe('kho')
  })
})
