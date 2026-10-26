import { describe, expect, it } from 'vitest'
import { addPickedLines, isBlankLine } from './add-picked-lines'
import { EMPTY_ITEM, type ImportFormItemValues } from './import-form-editor.schema'

const line = (materialSlug: string, extra: Partial<ImportFormItemValues> = {}) => ({
  ...EMPTY_ITEM,
  materialSlug,
  unitSlug: materialSlug ? 'u-kg' : '',
  ...extra,
})

describe('addPickedLines', () => {
  it('lấp các dòng trống (kể cả ở giữa) theo thứ tự trước, phần còn lại nối cuối', () => {
    const items = [line('m-a', { quantity: 2 }), line(''), line('m-b'), line('')]
    const { items: next, firstIndex } = addPickedLines(items, [
      { slug: 'm-x', baseUnitSlug: 'u-x' },
      { slug: 'm-y', baseUnitSlug: 'u-y' },
      { slug: 'm-z', baseUnitSlug: 'u-z' },
    ])
    expect(next.map((i) => i.materialSlug)).toEqual(['m-a', 'm-x', 'm-b', 'm-y', 'm-z'])
    expect(next.map((i) => i.unitSlug)).toEqual(['u-kg', 'u-x', 'u-kg', 'u-y', 'u-z'])
    expect(firstIndex).toBe(1)
    // Dòng có sẵn giữ nguyên (cùng tham chiếu) — bên gọi chỉ cập nhật dòng đổi.
    expect(next[0]).toBe(items[0])
    expect(next[2]).toBe(items[2])
  })

  it('dòng được lấp / thêm = EMPTY_ITEM + vật tư + đơn vị gốc', () => {
    const { items: next } = addPickedLines(
      [line('')],
      [
        { slug: 'm-x', baseUnitSlug: 'u-x' },
        { slug: 'm-y', baseUnitSlug: 'u-y' },
      ],
    )
    expect(next).toEqual([
      { ...EMPTY_ITEM, materialSlug: 'm-x', unitSlug: 'u-x' },
      { ...EMPTY_ITEM, materialSlug: 'm-y', unitSlug: 'u-y' },
    ])
  })

  it('chỉ lấp dòng TRỐNG HẲN: dòng chưa có vật tư nhưng đã gõ SL / đơn giá / ghi chú / bên bán riêng được giữ, dòng mới nối sau', () => {
    const halfTyped = [
      line('', { quantity: 5 }),
      line('', { unitPrice: 0 }),
      line('', { note: 'giao sáng' }),
      line('', { supplierOverride: 's-9' }),
    ]
    const items = [...halfTyped, line('')]
    const { items: next, firstIndex } = addPickedLines(items, [
      { slug: 'm-x', baseUnitSlug: 'u-x' },
      { slug: 'm-y', baseUnitSlug: 'u-y' },
    ])
    halfTyped.forEach((l, i) => expect(next[i]).toBe(l))
    expect(next.map((i) => i.materialSlug)).toEqual(['', '', '', '', 'm-x', 'm-y'])
    expect(firstIndex).toBe(4)
  })

  it('isBlankLine: không vật tư, SL, đơn giá, ghi chú, bên bán riêng, hạn dùng', () => {
    expect(isBlankLine({ ...EMPTY_ITEM })).toBe(true)
    expect(isBlankLine(line('m-a'))).toBe(false)
    expect(isBlankLine(line('', { quantity: 1 }))).toBe(false)
    expect(isBlankLine(line('', { unitPrice: 0 }))).toBe(false)
    expect(isBlankLine(line('', { note: 'x' }))).toBe(false)
    expect(isBlankLine(line('', { supplierOverride: 's-1' }))).toBe(false)
    expect(isBlankLine(line('', { expiryDate: '2026-12-31' }))).toBe(false)
  })

  it('không có dòng trống → nối cuối, firstIndex = dòng mới đầu tiên', () => {
    const items = [line('m-a'), line('m-b')]
    const { items: next, firstIndex } = addPickedLines(items, [
      { slug: 'm-x', baseUnitSlug: 'u-x' },
    ])
    expect(next.map((i) => i.materialSlug)).toEqual(['m-a', 'm-b', 'm-x'])
    expect(firstIndex).toBe(2)
  })

  it('không vượt max: lấp hết dòng trống, chỉ nối tới max, bỏ phần thừa', () => {
    const items = [line('m-a'), line('')]
    const { items: next, firstIndex } = addPickedLines(
      items,
      [
        { slug: 'm-x', baseUnitSlug: 'u-x' },
        { slug: 'm-y', baseUnitSlug: 'u-y' },
        { slug: 'm-z', baseUnitSlug: 'u-z' },
      ],
      3,
    )
    expect(next.map((i) => i.materialSlug)).toEqual(['m-a', 'm-x', 'm-y'])
    expect(firstIndex).toBe(1)
  })

  it('đã đủ max và không có dòng trống → không thêm gì, firstIndex null', () => {
    const items = [line('m-a'), line('m-b')]
    const result = addPickedLines(items, [{ slug: 'm-x', baseUnitSlug: 'u-x' }], 2)
    expect(result.items).toEqual(items)
    expect(result.firstIndex).toBeNull()
  })

  it('không chọn gì → giữ nguyên, firstIndex null', () => {
    const items = [line('')]
    expect(addPickedLines(items, [])).toEqual({ items, firstIndex: null })
  })
})
