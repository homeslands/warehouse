import { describe, expect, it } from 'vitest'
import type { InventoryItem } from '@/entities/inventory'
import { EMPTY_EXPORT_ITEM, type ExportFormItemValues } from './export-form-editor.schema'
import { addPickedExportLines, isBlankExportLine } from './pick-lines'

const line = (extra: Partial<ExportFormItemValues> = {}): ExportFormItemValues => ({
  ...EMPTY_EXPORT_ITEM,
  ...extra,
})
const stock = (slug: string): InventoryItem =>
  ({
    materialSlug: slug,
    baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
    units: [],
  }) as unknown as InventoryItem

describe('isBlankExportLine', () => {
  it('trống hẳn: không vật tư, SL, giá, ghi chú, lô', () => {
    expect(isBlankExportLine(line())).toBe(true)
    expect(isBlankExportLine(line({ materialSlug: 'm' }))).toBe(false)
    expect(isBlankExportLine(line({ quantity: 1 }))).toBe(false)
    expect(isBlankExportLine(line({ unitPrice: 0 }))).toBe(false)
    expect(isBlankExportLine(line({ note: 'x' }))).toBe(false)
    expect(isBlankExportLine(line({ batchSlug: 'b-1' }))).toBe(false)
  })
})

describe('addPickedExportLines', () => {
  it('lấp dòng trống trước, nối cuối; dòng mới = trống + vật tư + đơn vị gốc, lô tự chọn', () => {
    const items = [line({ materialSlug: 'm-a', unitSlug: 'u-kg' }), line(), line({ quantity: 3 })]
    const { items: next, firstIndex } = addPickedExportLines(
      items,
      [stock('m-x'), stock('m-y')],
      10,
    )
    expect(next.map((i) => i.materialSlug)).toEqual(['m-a', 'm-x', '', 'm-y'])
    expect(next[1]).toEqual({ ...EMPTY_EXPORT_ITEM, materialSlug: 'm-x', unitSlug: 'u-kg' })
    expect(next[2]).toBe(items[2])
    expect(firstIndex).toBe(1)
  })
  it('không vượt max', () => {
    const { items: next } = addPickedExportLines([line()], [stock('a'), stock('b'), stock('c')], 2)
    expect(next).toHaveLength(2)
  })
})
