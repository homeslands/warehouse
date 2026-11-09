import { toCreateInput, toUpdateInput } from './draft'
import { makeDraft, makeLine } from './fixtures'

const header = makeDraft([]).header

describe('toUpdateInput', () => {
  it('toUpdateInput sends empty string for cleared purchaseOrder and note', () => {
    const d = makeDraft([makeLine(1)], {
      version: 3,
      header: { ...header, purchaseOrder: null, note: null },
    })
    expect(toUpdateInput(d)).toEqual({
      code: 'PN-1',
      invoiceCode: 'HD-1',
      date: '2026-11-04',
      purchaseOrder: '',
      note: '',
      version: 3,
      items: [
        { materialSlug: 'm-1', unitSlug: 'u-1', quantity: 10, unitPrice: 1000, expiryDate: null },
      ],
    })
    // Chỉ khoảng trắng cũng là xoá trắng; có giá trị thì gửi đã cắt khoảng trắng.
    const blank = makeDraft([makeLine(1)], {
      header: { ...header, purchaseOrder: '  ', note: ' ghi chú ' },
    })
    expect(toUpdateInput(blank)).toMatchObject({ purchaseOrder: '', note: 'ghi chú' })
  })

  it('toUpdateInput keeps unitPrice of each line', () => {
    const d = makeDraft([
      makeLine(1, { unitPrice: 1500.005 }),
      makeLine(2, { unitPrice: 0 }),
      makeLine(3, { quantity: 0, unitPrice: 9 }),
    ])
    expect(toUpdateInput(d).items.map((i) => i.unitPrice)).toEqual([1500.01, 0])
  })
})

describe('toCreateInput', () => {
  it('toCreateInput omits null optional fields', () => {
    const d = makeDraft([makeLine(1, { base: null })], {
      formSlug: 'new',
      version: null,
      headerBase: null,
      header: { ...header, purchaseOrder: null, note: '  ' },
    })
    const input = toCreateInput(d)
    expect(input).toEqual({
      code: 'PN-1',
      invoiceCode: 'HD-1',
      date: '2026-11-04',
      items: [
        { materialSlug: 'm-1', unitSlug: 'u-1', quantity: 10, unitPrice: 1000, expiryDate: null },
      ],
    })
    expect('version' in input).toBe(false)
    const filled = makeDraft([makeLine(1, { base: null })], {
      formSlug: 'new',
      version: null,
      header: { ...header, purchaseOrder: ' PO-1 ', note: 'n' },
    })
    expect(toCreateInput(filled)).toMatchObject({ purchaseOrder: 'PO-1', note: 'n' })
  })
})
