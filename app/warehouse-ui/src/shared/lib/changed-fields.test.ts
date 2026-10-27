import { describe, expect, it } from 'vitest'
import { changedFieldLabels } from './changed-fields'

describe('changedFieldLabels', () => {
  const labels = { code: 'Mã', name: 'Tên', items: 'Dòng' }

  it('lấy nhãn của khoá đã đổi (boolean / lồng sâu), bỏ khoá rỗng và khoá không nhãn', () => {
    expect(
      changedFieldLabels({ name: true, items: [undefined, { quantity: true }], meta: {} }, labels),
    ).toEqual(['Tên', 'Dòng'])
  })

  it('thứ tự theo labels, không theo dirtyFields', () => {
    expect(changedFieldLabels({ name: true, code: true }, labels)).toEqual(['Mã', 'Tên'])
  })

  it('không đổi gì → []', () => {
    expect(changedFieldLabels({}, labels)).toEqual([])
    expect(changedFieldLabels({ name: false, items: [undefined, {}] }, labels)).toEqual([])
  })
})
