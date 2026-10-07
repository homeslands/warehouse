import { describe, expect, it } from 'vitest'
import { toUserSearchQuery } from './search-query'

describe('toUserSearchQuery', () => {
  it('toàn chữ số (bỏ khoảng trắng) → phonenumber', () => {
    expect(toUserSearchQuery('0390')).toEqual({ phonenumber: '0390' })
    expect(toUserSearchQuery(' 0390 461 ')).toEqual({ phonenumber: '0390461' })
  })
  it('có chữ → name (giữ nguyên, trim)', () => {
    expect(toUserSearchQuery('  Nguyễn Văn ')).toEqual({ name: 'Nguyễn Văn' })
    expect(toUserSearchQuery('root')).toEqual({ name: 'root' })
  })
  it('trống / chỉ khoảng trắng / undefined → không lọc', () => {
    expect(toUserSearchQuery('')).toEqual({})
    expect(toUserSearchQuery('   ')).toEqual({})
    expect(toUserSearchQuery(undefined)).toEqual({})
  })
})
