import { describe, expect, it } from 'vitest'
import type { Unit } from '@/entities/unit'
import { toCreateInput, toUpdateInput, unitFormSchema } from './unit-form.schema'

const unit: Unit = {
  slug: 'u-kg',
  createdAt: '',
  updatedAt: '',
  code: 'KG',
  name: 'Kilogram',
  description: 'Khối lượng',
  materialCount: { asBaseUnit: 0, asConversionUnit: 0, total: 0 },
}

describe('unitFormSchema', () => {
  it('mã 1 ký tự hợp lệ; gạch cuối sai; trống báo bắt buộc', () => {
    expect(unitFormSchema.safeParse({ code: 'M', name: 'Mét', description: '' }).success).toBe(true)
    const bad = unitFormSchema.safeParse({ code: 'KG-', name: 'x', description: '' })
    expect(bad.error?.issues[0].message).toBe('units:codeInvalid')
    const empty = unitFormSchema.safeParse({ code: ' ', name: '', description: '' })
    // Zod v4 vẫn chạy `regex` sau `min` → ô trống có 2 lỗi; `FormMessage` chỉ hiện lỗi đầu của mỗi ô.
    const firstByField = (path: string) =>
      empty.error?.issues.find((i) => i.path[0] === path)?.message
    expect(firstByField('code')).toBe('units:codeRequired')
    expect(firstByField('name')).toBe('units:nameRequired')
  })
})

describe('toCreateInput / toUpdateInput', () => {
  it('tạo: trim, bỏ mô tả trống', () => {
    expect(toCreateInput({ code: ' kg ', name: ' Kilogram ', description: '  ' })).toEqual({
      code: 'kg',
      name: 'Kilogram',
    })
  })
  it('sửa: chỉ trường đổi; xoá trống mô tả → gửi chuỗi rỗng', () => {
    expect(toUpdateInput({ code: 'KG', name: 'Kilogram', description: '' }, unit)).toEqual({
      description: '',
    })
    expect(
      toUpdateInput({ code: 'KG', name: 'Ki-lô-gam', description: 'Khối lượng' }, unit),
    ).toEqual({ name: 'Ki-lô-gam' })
  })
})
