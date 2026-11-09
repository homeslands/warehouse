import { filterInventory, typesOf } from './filter'
import { item } from './fixtures'

const xm = item({ slug: 'a', materialName: 'Xi măng Hà Tiên PCB40', materialCode: 'VT-XM' })
const bl = item({
  slug: 'b',
  materialName: 'Bu lông M10',
  materialCode: 'VT-BL',
  typeSlug: 'type-2',
  typeName: 'Bu lông',
  isBelowMinimum: true,
})
const out = item({ slug: 'c', materialName: 'Cát vàng', materialCode: 'VT-CV', quantity: 0 })

describe('filterInventory', () => {
  it('khớp tên không dấu', () => {
    expect(filterInventory([xm, bl], { query: 'xi mang' })).toEqual([xm])
  })
  it('khớp theo mã', () => {
    expect(filterInventory([xm, bl], { query: 'VT-XM' })).toEqual([xm])
  })
  it('level low giữ isBelowMinimum hoặc hết hàng', () => {
    expect(filterInventory([xm, bl, out], { query: '', level: 'low' })).toEqual([bl, out])
  })
  it('level high chỉ giữ isAboveMaximum', () => {
    const hi = item({ slug: 'h', isAboveMaximum: true })
    expect(filterInventory([xm, hi], { query: '', level: 'high' })).toEqual([hi])
  })
  it('level high bỏ item có max thực áp 0', () => {
    const hi = item({ slug: 'h', isAboveMaximum: true })
    const zero = item({ slug: 'z', isAboveMaximum: true, effectiveMaximumInventory: 0 })
    expect(filterInventory([hi, zero], { query: '', level: 'high' })).toEqual([hi])
  })
  it('lọc theo typeSlug', () => {
    expect(filterInventory([xm, bl], { query: '', typeSlug: 'type-2' })).toEqual([bl])
  })
  it('sắp theo tên bỏ dấu', () => {
    expect(filterInventory([xm, bl], { query: '' })).toEqual([bl, xm])
  })
  it('1.500 phần tử lọc dưới 200 ms', () => {
    const many = Array.from({ length: 1500 }, (_, i) =>
      item({ slug: `i${i}`, materialName: `Vật tư số ${i}`, materialCode: `VT-${i}` }),
    )
    const t = performance.now()
    const r = filterInventory(many, { query: 'vat tu so 14' })
    expect(performance.now() - t).toBeLessThan(200)
    expect(r.length).toBeGreaterThan(0)
  })
})

describe('typesOf', () => {
  it('loại duy nhất, sắp theo tên', () => {
    expect(typesOf([xm, bl, out])).toEqual([
      { slug: 'type-2', name: 'Bu lông' },
      { slug: 'type-1', name: 'Xi măng' },
    ])
  })
})
