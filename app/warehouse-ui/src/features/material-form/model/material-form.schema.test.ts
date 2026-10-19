import { describe, expect, it } from 'vitest'
import type { Material } from '@/entities/material'
import {
  materialFormSchema,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  type MaterialFormValues,
} from './material-form.schema'

const material: Material = {
  slug: 'm-1',
  createdAt: '',
  updatedAt: '',
  code: 'VT-01',
  name: 'Xi măng',
  minimumInventory: 10,
  maximumInventory: 100,
  type: { slug: 'mt-1', code: 'MT-01', name: 'Vật liệu' },
  baseUnit: { slug: 'u-kg', code: 'KG', name: 'Kilogram' },
  hasSupplier: false,
  suppliers: [],
  warehouses: [],
  units: [],
}

const valid: MaterialFormValues = {
  code: 'VT-02',
  name: 'Cát',
  typeSlug: 'mt-1',
  baseUnitSlug: 'u-kg',
  minimumInventory: undefined,
  maximumInventory: undefined,
}

/** Lỗi đầu tiên của mỗi ô — đúng thứ `FormMessage` hiện. */
const messages = (values: MaterialFormValues) => {
  const issues = materialFormSchema.safeParse(values).error?.issues ?? []
  const first = new Map<string, string>()
  for (const i of issues) if (!first.has(i.path.join('.'))) first.set(i.path.join('.'), i.message)
  return [...first.entries()]
}

describe('materialFormSchema', () => {
  it('thiếu loại / đơn vị gốc → khoá i18n riêng', () => {
    expect(messages({ ...valid, typeSlug: '', baseUnitSlug: '' })).toEqual([
      ['typeSlug', 'materials:typeRequired'],
      ['baseUnitSlug', 'materials:baseUnitRequired'],
    ])
  })
  it('số âm, > 6 số lẻ, số mũ → inventoryInvalid; ≥ 1e12 → inventoryTooLarge', () => {
    expect(messages({ ...valid, minimumInventory: -1 })).toEqual([
      ['minimumInventory', 'materials:inventoryInvalid'],
    ])
    expect(messages({ ...valid, maximumInventory: 0.1234567 })).toEqual([
      ['maximumInventory', 'materials:inventoryInvalid'],
    ])
    expect(messages({ ...valid, minimumInventory: 1e-7, maximumInventory: 1 })).toEqual([
      ['minimumInventory', 'materials:inventoryInvalid'],
    ])
    // Trần DECIMAL(18,6) có câu riêng: số đó thoả "≥ 0, ≤ 6 số lẻ" nên câu chung sẽ khó hiểu.
    expect(messages({ ...valid, maximumInventory: 1e12 })).toEqual([
      ['maximumInventory', 'materials:inventoryTooLarge'],
    ])
    expect(messages({ ...valid, maximumInventory: 999_999_999_999.5 })).toEqual([])
  })
  it('tối đa < tối thiểu → lỗi ở ô tối đa; để trống cả hai = 0 hợp lệ', () => {
    expect(messages({ ...valid, minimumInventory: 10, maximumInventory: 5 })).toEqual([
      ['maximumInventory', 'materials:maximumBelowMinimum'],
    ])
    expect(messages(valid)).toEqual([])
  })
})

describe('chuyển đổi', () => {
  it('tạo: bỏ ngưỡng trống (backend mặc định 0)', () => {
    expect(toCreateInput({ ...valid, code: ' vt-02 ', maximumInventory: 50 })).toEqual({
      code: 'vt-02',
      name: 'Cát',
      typeSlug: 'mt-1',
      baseUnitSlug: 'u-kg',
      maximumInventory: 50,
    })
  })
  it('sửa: chỉ trường đổi; xoá trống ngưỡng = 0', () => {
    const values = { ...toFormValues(material), minimumInventory: undefined }
    expect(toUpdateInput(values, material)).toEqual({ minimumInventory: 0 })
  })
  it('vật tư cũ chưa có đơn vị gốc: form trống ô đơn vị, không đổi thì không gửi baseUnitSlug', () => {
    const legacy = { ...material, baseUnit: null }
    const values = toFormValues(legacy)
    expect(values.baseUnitSlug).toBe('')
    expect(toUpdateInput({ ...values, name: 'Xi măng PCB40' }, legacy)).toEqual({
      name: 'Xi măng PCB40',
    })
  })
})
