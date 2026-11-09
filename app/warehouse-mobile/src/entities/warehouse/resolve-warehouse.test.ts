import { resolveWarehouse } from './resolve-warehouse'

const w = (slug: string) => ({
  slug,
  code: slug.toUpperCase(),
  name: `Kho ${slug}`,
  isManager: false,
})

describe('resolveWarehouse', () => {
  it('none khi không có kho', () => {
    expect(resolveWarehouse([], null)).toEqual({ kind: 'none' })
  })
  it('1 kho, chưa có lastSlug: tự chọn', () => {
    expect(resolveWarehouse([w('a')], null)).toEqual({ kind: 'selected', warehouse: w('a') })
  })
  it('2 kho, lastSlug trùng: chọn kho đó', () => {
    expect(resolveWarehouse([w('a'), w('b')], 'b')).toEqual({ kind: 'selected', warehouse: w('b') })
  })
  it('2 kho, lastSlug null: choose', () => {
    expect(resolveWarehouse([w('a'), w('b')], null)).toEqual({ kind: 'choose' })
  })
  it('2 kho, lastSlug không còn trong danh sách: choose', () => {
    expect(resolveWarehouse([w('a'), w('b')], 'gone')).toEqual({ kind: 'choose' })
  })
})
