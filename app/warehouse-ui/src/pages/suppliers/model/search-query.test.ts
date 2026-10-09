import { describe, expect, it } from 'vitest'
import {
  isAmbiguousSupplierSearch,
  supplierSearchField,
  toSupplierSearchQuery,
} from './search-query'

describe('toSupplierSearchQuery', () => {
  it('trống / chỉ khoảng trắng / undefined → không lọc', () => {
    expect(toSupplierSearchQuery('')).toEqual({})
    expect(toSupplierSearchQuery('   ')).toEqual({})
    expect(toSupplierSearchQuery(undefined)).toEqual({})
  })

  it('MST có đuôi chi nhánh (có/không gạch, có khoảng trắng) → taxCode dạng chuẩn 10-3', () => {
    expect(toSupplierSearchQuery('0101234567-001')).toEqual({ taxCode: '0101234567-001' })
    expect(toSupplierSearchQuery('0101234567001')).toEqual({ taxCode: '0101234567-001' })
    expect(toSupplierSearchQuery(' 0101 234 567 - 001 ')).toEqual({ taxCode: '0101234567-001' })
  })

  it('10 chữ số không mang đầu số di động (03/05/07/08/09) → taxCode', () => {
    expect(toSupplierSearchQuery('0101234567')).toEqual({ taxCode: '0101234567' })
    expect(toSupplierSearchQuery('8012345678')).toEqual({ taxCode: '8012345678' })
  })

  it('10 chữ số đầu số di động → phonenumber (bỏ khoảng trắng, chấm, gạch)', () => {
    expect(toSupplierSearchQuery('0912345678')).toEqual({ phonenumber: '0912345678' })
    expect(toSupplierSearchQuery('0912.345.678')).toEqual({ phonenumber: '0912345678' })
    expect(toSupplierSearchQuery('0912-345-678')).toEqual({ phonenumber: '0912345678' })
  })

  it('chữ số độ dài khác (một phần SĐT, máy bàn 11 số) → phonenumber', () => {
    expect(toSupplierSearchQuery('0241')).toEqual({ phonenumber: '0241' })
    expect(toSupplierSearchQuery('024 1234 5678')).toEqual({ phonenumber: '02412345678' })
  })

  it('một từ có cả chữ lẫn số, hoặc có gạch nối → code viết hoa', () => {
    expect(toSupplierSearchQuery('ncc3')).toEqual({ code: 'NCC3' })
    expect(toSupplierSearchQuery(' ncc-hn-01 ')).toEqual({ code: 'NCC-HN-01' })
    expect(toSupplierSearchQuery('NCC-HN')).toEqual({ code: 'NCC-HN' })
  })

  it('còn lại → search (tên / người liên hệ / email), giữ nguyên chữ, trim', () => {
    expect(toSupplierSearchQuery('  Công ty ABC ')).toEqual({ search: 'Công ty ABC' })
    expect(toSupplierSearchQuery('abc')).toEqual({ search: 'abc' })
    expect(toSupplierSearchQuery('sales@abc.vn')).toEqual({ search: 'sales@abc.vn' })
    expect(toSupplierSearchQuery('NCC 01')).toEqual({ search: 'NCC 01' })
  })
})

describe('toSupplierSearchQuery — người dùng chọn trường cho 10 chữ số', () => {
  it('prefer thắng phần đoán với đúng 10 chữ số (MST TP.HCM 03… bị đoán là SĐT)', () => {
    expect(toSupplierSearchQuery('0301234567', 'taxCode')).toEqual({ taxCode: '0301234567' })
    expect(toSupplierSearchQuery('0101234567', 'phonenumber')).toEqual({
      phonenumber: '0101234567',
    })
  })
  it('dạng nhập khác bỏ qua prefer', () => {
    expect(toSupplierSearchQuery('0241', 'taxCode')).toEqual({ phonenumber: '0241' })
    expect(toSupplierSearchQuery('Công ty', 'taxCode')).toEqual({ search: 'Công ty' })
    expect(toSupplierSearchQuery('0101234567001', 'phonenumber')).toEqual({
      taxCode: '0101234567-001',
    })
  })
})

describe('isAmbiguousSupplierSearch', () => {
  it('chỉ đúng 10 chữ số (cho phép khoảng trắng / chấm / gạch)', () => {
    expect(isAmbiguousSupplierSearch('0912 345 678')).toBe(true)
    expect(isAmbiguousSupplierSearch('0101234567')).toBe(true)
    expect(isAmbiguousSupplierSearch('0241')).toBe(false)
    expect(isAmbiguousSupplierSearch('0101234567-001')).toBe(false)
    expect(isAmbiguousSupplierSearch('ncc-01')).toBe(false)
    expect(isAmbiguousSupplierSearch(undefined)).toBe(false)
  })
})

describe('supplierSearchField', () => {
  it('trả về tham số đang dùng, undefined khi không lọc', () => {
    expect(supplierSearchField({ taxCode: '0101234567' })).toBe('taxCode')
    expect(supplierSearchField({ search: 'abc' })).toBe('search')
    expect(supplierSearchField({})).toBeUndefined()
  })
})
