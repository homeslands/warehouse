import { toMaterialSearch } from './search'

describe('toMaterialSearch', () => {
  it.each([
    ['', { kind: 'all' }],
    ['  ', { kind: 'all' }],
    ['ống', { kind: 'search', name: 'ống' }],
    ['kg-01', { kind: 'search', name: 'kg', code: 'KG-01' }],
    ['ống 3/4', { kind: 'search', name: 'ống 3' }],
    ['#A1', { kind: 'invalid' }],
    ['/', { kind: 'invalid' }],
    ['A_1', { kind: 'search', name: 'A', code: 'A_1' }],
  ])('%j', (q, expected) => {
    expect(toMaterialSearch(q)).toEqual(expected)
  })
})
