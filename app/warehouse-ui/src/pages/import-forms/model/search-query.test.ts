import { describe, expect, it } from 'vitest'
import { toImportFormSearchQuery } from './search-query'

describe('toImportFormSearchQuery', () => {
  it('không có chữ → không gửi gì, không phải trống-do-lọc', () => {
    expect(toImportFormSearchQuery(undefined, undefined)).toEqual({ query: {}, symbolOnly: false })
    expect(toImportFormSearchQuery('   ', 'invoiceCode')).toEqual({ query: {}, symbolOnly: false })
  })

  it('mặc định theo mã phiếu: làm sạch, viết hoa', () => {
    expect(toImportFormSearchQuery('hd-0001', undefined).query).toEqual({ code: 'HD-0001' })
    expect(toImportFormSearchQuery('pn_01 x', 'code').query).toEqual({ code: 'PN_01X' })
  })

  it('mã phiếu toàn ký hiệu → rỗng, trống-do-lọc', () => {
    expect(toImportFormSearchQuery('#$%', 'code')).toEqual({ query: {}, symbolOnly: true })
  })

  it('số hoá đơn / PO: chỉ trim, giữ nguyên chữ, cắt 64 ký tự, một khoá duy nhất', () => {
    expect(toImportFormSearchQuery(' hd-0001 ', 'invoiceCode').query).toEqual({
      invoiceCode: 'hd-0001',
    })
    expect(toImportFormSearchQuery('#$%', 'purchaseOrder').query).toEqual({ purchaseOrder: '#$%' })
    expect(toImportFormSearchQuery('a'.repeat(70), 'invoiceCode').query.invoiceCode).toHaveLength(
      64,
    )
  })
})
