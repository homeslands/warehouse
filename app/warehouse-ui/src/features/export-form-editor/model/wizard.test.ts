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
  it('ba bước và stepIndex', () => {
    expect(WIZARD_STEPS).toEqual(['info', 'items', 'review'])
    expect(stepIndex('review')).toBe(2)
  })

  it('stepFields', () => {
    expect(stepFields('info')).toEqual([
      'type',
      'receiver',
      'purchaseOrder',
      'invoiceCode',
      'file',
      'note',
      'code',
    ])
    expect(stepFields('items')).toEqual(['items'])
    expect(stepFields('review')).toEqual([])
  })

  it('stepOfField', () => {
    expect(stepOfField('items.3.batchSlug')).toBe('items')
    expect(stepOfField('receiver')).toBe('info')
  })

  it('firstStepWithError', () => {
    expect(firstStepWithError({})).toBeNull()
    expect(firstStepWithError({ items: [undefined, { quantity: { type: 'x' } }] } as never)).toBe(
      'items',
    )
    expect(
      firstStepWithError({ receiver: { type: 'x' }, items: [{ quantity: {} }] } as never),
    ).toBe('info')
    expect(firstStepWithError({ items: [undefined] } as never)).toBeNull()
    expect(firstStepWithError({ items: Object.assign([], { root: { type: 'x' } }) } as never)).toBe(
      'items',
    )
  })

  it('firstErrorField theo thứ tự ô trong dòng', () => {
    const errors = {
      items: [
        undefined,
        { unitPrice: { type: 'x' }, batchSlug: { type: 'x' }, quantity: { type: 'x' } },
      ],
    } as never
    expect(firstErrorField(errors, 'items')).toBe('items.1.batchSlug')
    expect(firstErrorField({ code: {}, purchaseOrder: {} } as never, 'info')).toBe('purchaseOrder')
    expect(firstErrorField({} as never, 'review')).toBeNull()
  })
})
