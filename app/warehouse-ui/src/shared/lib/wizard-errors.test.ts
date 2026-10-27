import { describe, expect, it } from 'vitest'
import { firstErrorField, firstStepWithError, hasError } from './wizard-errors'

type Step = 'info' | 'items' | 'review'
const steps: Step[] = ['info', 'items', 'review']
const stepFields = (s: Step): never[] =>
  (s === 'info' ? ['a', 'b'] : s === 'items' ? ['items'] : []) as never[]
const config = {
  stepFields,
  rowsStep: 'items' as Step,
  rowsKey: 'items',
  rowFields: ['x', 'y', 'z'],
}

describe('wizard-errors', () => {
  it('hasError', () => {
    expect(hasError(undefined)).toBe(false)
    expect(hasError([undefined, undefined])).toBe(false)
    expect(hasError([undefined, {}])).toBe(true)
    expect(hasError(Object.assign([], { root: {} }))).toBe(true)
    expect(hasError({ type: 'x' })).toBe(true)
  })

  it('firstStepWithError chọn bước sớm nhất', () => {
    expect(firstStepWithError({}, steps, stepFields)).toBeNull()
    expect(firstStepWithError({ items: [undefined] } as never, steps, stepFields)).toBeNull()
    expect(firstStepWithError({ items: [{ x: {} }] } as never, steps, stepFields)).toBe('items')
    expect(firstStepWithError({ b: {}, items: [{ x: {} }] } as never, steps, stepFields)).toBe(
      'info',
    )
  })

  it('firstErrorField: dòng nhỏ nhất rồi ô đầu theo rowFields', () => {
    const errors = { items: [undefined, { z: {}, y: {} }, { x: {} }] } as never
    expect(firstErrorField(errors, 'items', config)).toBe('items.1.y')
  })

  it('firstErrorField: lỗi cấp mảng là phương án cuối', () => {
    const errors = { items: Object.assign([], { root: {} }) } as never
    expect(firstErrorField(errors, 'items', config)).toBe('items')
    expect(firstErrorField({} as never, 'items', config)).toBeNull()
  })

  it('firstErrorField: bước thường theo thứ tự stepFields; review → null', () => {
    expect(firstErrorField({ b: {}, a: {} } as never, 'info', config)).toBe('a')
    expect(firstErrorField({ a: {} } as never, 'review', config)).toBeNull()
  })
})
