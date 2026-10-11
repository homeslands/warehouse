import { describe, expect, it } from 'vitest'
import type { MaterialType } from '@/entities/material-type'
import { materialTypeFormSchema, toCreateInput, toUpdateInput } from './material-type-form.schema'

const type: MaterialType = {
  slug: 'mt-1',
  createdAt: '',
  updatedAt: '',
  code: 'MT-01',
  name: 'Tiêu hao',
  description: 'Dùng hằng ngày',
}

describe('materialTypeFormSchema', () => {
  it('mã 1 ký tự sai (khác đơn vị)', () => {
    const r = materialTypeFormSchema.safeParse({ code: 'M', name: 'x', description: '' })
    expect(r.error?.issues[0].message).toBe('materialTypes:codeInvalid')
  })
})

describe('toCreateInput / toUpdateInput', () => {
  it('tạo: bỏ mô tả trống', () => {
    expect(toCreateInput({ code: 'mt-02', name: ' Hoá chất ', description: '' })).toEqual({
      code: 'mt-02',
      name: 'Hoá chất',
    })
  })
  it('sửa: xoá trống mô tả → ""', () => {
    expect(toUpdateInput({ code: 'MT-01', name: 'Tiêu hao', description: ' ' }, type)).toEqual({
      description: '',
    })
  })
})
