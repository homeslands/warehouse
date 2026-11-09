import { deriveHeaderSupplier } from './supplier'

describe('deriveHeaderSupplier', () => {
  it('chọn NCC nhiều nhất', () => {
    expect(deriveHeaderSupplier(['a', 'b', 'a'])).toBe('a')
  })
  it('hoà → dòng đầu có NCC', () => {
    expect(deriveHeaderSupplier(['b', 'a'])).toBe('b')
    expect(deriveHeaderSupplier([null, 'c'])).toBe('c')
  })
  it('không có NCC → null', () => {
    expect(deriveHeaderSupplier([null, null])).toBeNull()
    expect(deriveHeaderSupplier([])).toBeNull()
  })
})
