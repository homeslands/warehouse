import { describe, expect, it } from 'vitest'
import { toExportFormSearchQuery } from './search-query'

describe('toExportFormSearchQuery', () => {
  it('không có chữ → không gửi gì, không phải trống-do-lọc', () => {
    expect(toExportFormSearchQuery(undefined, undefined)).toEqual({ query: {}, symbolOnly: false })
    expect(toExportFormSearchQuery('   ', 'invoiceCode')).toEqual({ query: {}, symbolOnly: false })
  })

  it('mặc định theo mã phiếu: làm sạch, viết hoa', () => {
    expect(toExportFormSearchQuery('px-0001', undefined).query).toEqual({ code: 'PX-0001' })
    expect(toExportFormSearchQuery('px_01 x', 'code').query).toEqual({ code: 'PX_01X' })
  })

  it('mã phiếu toàn ký hiệu → rỗng, trống-do-lọc', () => {
    expect(toExportFormSearchQuery('#$%', 'code')).toEqual({ query: {}, symbolOnly: true })
  })

  it('số hoá đơn / PO: chỉ trim, giữ nguyên chữ, cắt 64 ký tự, một khoá duy nhất', () => {
    expect(toExportFormSearchQuery(' hd-0001 ', 'invoiceCode').query).toEqual({
      invoiceCode: 'hd-0001',
    })
    expect(toExportFormSearchQuery('#$%', 'purchaseOrder').query).toEqual({ purchaseOrder: '#$%' })
    expect(
      toExportFormSearchQuery('a'.repeat(70), 'purchaseOrder').query.purchaseOrder,
    ).toHaveLength(64)
  })
})
