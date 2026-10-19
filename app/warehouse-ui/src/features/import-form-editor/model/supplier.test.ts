import { describe, expect, it } from 'vitest'
import { EMPTY_ITEM, emptyFormValues } from './import-form-editor.schema'
import { countFollowingLines, deriveHeaderSupplier } from './supplier'

describe('deriveHeaderSupplier', () => {
  it('chọn NCC nhiều nhất', () => {
    expect(deriveHeaderSupplier(['a', 'b', 'a'])).toBe('a')
  })
  it('hoà → dòng đầu có NCC', () => {
    expect(deriveHeaderSupplier(['b', 'a'])).toBe('b')
    expect(deriveHeaderSupplier([null, 'c'])).toBe('c')
  })
  it('không có NCC → rỗng', () => {
    expect(deriveHeaderSupplier([null, null])).toBe('')
  })
})

describe('countFollowingLines', () => {
  it('chỉ đếm dòng đã chọn vật tư và không override', () => {
    const base = emptyFormValues(new Date(2026, 9, 13))
    const withMat = { ...EMPTY_ITEM, materialSlug: 'm-1' }
    expect(
      countFollowingLines({
        ...base,
        items: [withMat, withMat, { ...withMat, supplierOverride: 'x' }, { ...EMPTY_ITEM }],
      }),
    ).toBe(2)
  })
})
