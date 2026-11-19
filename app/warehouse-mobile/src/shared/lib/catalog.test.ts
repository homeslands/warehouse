import { filterCatalog, sortByCode, type CatalogItem } from './catalog'

const items: CatalogItem[] = [
  { slug: 'kg', code: 'KG-01', name: 'Ki lô gam' },
  { slug: 'cai', code: 'CAI', name: 'Cái' },
]

describe('filterCatalog', () => {
  it.each(['cai', 'Cái', 'CAI'])('"%s" chỉ khớp dòng CAI', (q) => {
    expect(filterCatalog(items, q).map((i) => i.code)).toEqual(['CAI'])
  })
  it('khớp theo mã', () => {
    expect(filterCatalog(items, 'kg').map((i) => i.code)).toEqual(['KG-01'])
  })
  it('khớp tên không dấu', () => {
    expect(filterCatalog(items, 'lo gam').map((i) => i.code)).toEqual(['KG-01'])
  })
  it('query khoảng trắng trả tất cả', () => {
    expect(filterCatalog(items, '  ')).toHaveLength(2)
  })
})

describe('sortByCode', () => {
  it('sắp theo mã, không đổi mảng gốc', () => {
    const sorted = sortByCode(items)
    expect(sorted.map((i) => i.code)).toEqual(['CAI', 'KG-01'])
    expect(items[0].code).toBe('KG-01')
  })
  it('A2 trước A10', () => {
    const rows = ['A10', 'A2'].map((code) => ({ slug: code, code, name: code }))
    expect(sortByCode(rows).map((i) => i.code)).toEqual(['A2', 'A10'])
  })
})
