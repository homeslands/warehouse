import { describe, expect, it } from 'vitest'
import { toMaterialSearchQuery } from './search-query'

describe('toMaterialSearchQuery', () => {
  it('trống / chỉ khoảng trắng → không lọc', () => {
    expect(toMaterialSearchQuery('')).toEqual({})
    expect(toMaterialSearchQuery('   ')).toEqual({})
  })
  it('trông như mã → code viết hoa', () => {
    expect(toMaterialSearchQuery(' nl04 ')).toEqual({ code: 'NL04' })
    expect(toMaterialSearchQuery('mat-001')).toEqual({ code: 'MAT-001' })
  })
  it('còn lại → name, giữ nguyên chữ', () => {
    expect(toMaterialSearchQuery('Bột giặt')).toEqual({ name: 'Bột giặt' })
    expect(toMaterialSearchQuery('xi măng')).toEqual({ name: 'xi măng' })
    expect(toMaterialSearchQuery('NL')).toEqual({ name: 'NL' })
    expect(toMaterialSearchQuery('PC40 bao')).toEqual({ name: 'PC40 bao' })
  })
})
