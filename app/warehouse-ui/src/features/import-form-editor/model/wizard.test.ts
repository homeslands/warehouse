import { describe, expect, it } from 'vitest'
import {
  WIZARD_STEPS,
  firstErrorField,
  firstStepWithError,
  stepFields,
  stepIndex,
  stepOfField,
} from './wizard'

describe('wizard', () => {
  it('có ba bước theo thứ tự info → items → review', () => {
    expect(WIZARD_STEPS).toEqual(['info', 'items', 'review'])
  })

  it('stepIndex trả vị trí của bước', () => {
    expect(stepIndex('info')).toBe(0)
    expect(stepIndex('items')).toBe(1)
    expect(stepIndex('review')).toBe(2)
  })

  it('stepFields: info gồm các ô đầu phiếu theo thứ tự trên màn hình, items là mảng dòng, review không có ô', () => {
    expect(stepFields('info')).toEqual([
      'supplierSlug',
      'invoiceCode',
      'date',
      'file',
      'purchaseOrder',
      'note',
      'code',
    ])
    expect(stepFields('items')).toEqual(['items'])
    expect(stepFields('review')).toEqual([])
  })

  it('stepOfField: ô dòng thuộc items, còn lại thuộc info', () => {
    expect(stepOfField('items.3.unitPrice')).toBe('items')
    expect(stepOfField('items')).toBe('items')
    expect(stepOfField('code')).toBe('info')
    expect(stepOfField('file')).toBe('info')
  })

  it('firstStepWithError: bước sớm nhất có lỗi', () => {
    expect(firstStepWithError({ code: { type: 'x' } } as never)).toBe('info')
    expect(firstStepWithError({ items: [undefined, { unitPrice: { type: 'x' } }] } as never)).toBe(
      'items',
    )
    expect(
      firstStepWithError({
        code: { type: 'x' },
        items: [undefined, { unitPrice: { type: 'x' } }],
      } as never),
    ).toBe('info')
    expect(firstStepWithError({} as never)).toBeNull()
    expect(firstStepWithError({ items: { root: { type: 'x' } } } as never)).toBe('items')
  })

  it('firstStepWithError: lỗi cấp mảng gắn trên chính mảng (root) cũng tính là bước ②', () => {
    const errors = { items: Object.assign([], { root: { type: 'x' } }) }
    expect(firstStepWithError(errors as never)).toBe('items')
  })

  it('firstErrorField: mảng chỉ có root không có dòng lỗi → trả về items', () => {
    const errors = { items: Object.assign([], { root: { type: 'x' } }) }
    expect(firstErrorField(errors as never, 'items')).toBe('items')
  })

  it('firstErrorField: mảng vừa có dòng lỗi vừa có root → vẫn trả về ô của dòng', () => {
    const errors = {
      items: Object.assign([undefined, { quantity: { type: 'x' } }], {
        root: { type: 'x' },
      }),
    }
    expect(firstErrorField(errors as never, 'items')).toBe('items.1.quantity')
  })

  it('firstErrorField: ô Hạn dùng đứng sau Đơn giá trong dòng', () => {
    expect(firstErrorField({ items: [{ expiryDate: {}, unitPrice: {} }] } as never, 'items')).toBe(
      'items.0.unitPrice',
    )
    expect(firstErrorField({ items: [{ expiryDate: {} }] } as never, 'items')).toBe(
      'items.0.expiryDate',
    )
  })

  it('firstErrorField: ô lỗi đầu tiên theo thứ tự stepFields', () => {
    expect(firstErrorField({ invoiceCode: {}, code: {} } as never, 'info')).toBe('invoiceCode')
    // Đúng thứ tự trên màn hình: Chứng từ đính kèm đứng trước Mã phiếu.
    expect(firstErrorField({ code: {}, file: {} } as never, 'info')).toBe('file')
    expect(firstErrorField({ code: {}, note: {} } as never, 'info')).toBe('note')
    expect(
      firstErrorField({ items: [undefined, { quantity: {}, unitPrice: {} }] } as never, 'items'),
    ).toBe('items.1.quantity')
    expect(firstErrorField({} as never, 'review')).toBeNull()
  })
})
