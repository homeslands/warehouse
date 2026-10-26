import { describe, expect, it } from 'vitest'
import type { ExportFormItem } from '@/entities/export-form'
import { fallbackMaterialsOf } from './fallback'

const line = (materialSlug: string, unitSlug: string, unitCode: string) =>
  ({
    materialSlug,
    materialCode: materialSlug.toUpperCase(),
    materialName: `Tên ${materialSlug}`,
    unitSlug,
    unitCode,
    unitName: unitCode,
  }) as ExportFormItem

describe('fallbackMaterialsOf', () => {
  it('gộp theo vật tư, mỗi đơn vị một lần, giữ thứ tự xuất hiện', () => {
    const map = fallbackMaterialsOf([
      line('m-1', 'u-kg', 'KG'),
      line('m-1', 'u-bag', 'BAG'),
      line('m-1', 'u-kg', 'KG'),
      line('m-2', 'u-kg', 'KG'),
    ])
    expect(map.get('m-1')).toEqual({
      code: 'M-1',
      name: 'Tên m-1',
      units: [
        { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'KG' },
        { unitSlug: 'u-bag', unitCode: 'BAG', unitName: 'BAG' },
      ],
    })
    expect(map.get('m-2')?.units).toHaveLength(1)
  })

  it('không có dòng → map rỗng', () => {
    expect(fallbackMaterialsOf(undefined).size).toBe(0)
  })
})
