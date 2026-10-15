import { describe, expect, it } from 'vitest'
import { addMaterialDefaults, addMaterialSchema } from './add-material.schema'

const issues = (v: unknown) => {
  const r = addMaterialSchema.safeParse(v)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`)
}
const valid = { code: 'VT-09', name: 'Xi măng', typeSlug: 't', baseUnitSlug: 'u', supplierSlug: '' }

describe('addMaterialSchema', () => {
  it('hợp lệ; NCC tuỳ chọn', () => {
    expect(issues(valid)).toEqual([])
  })
  it('bắt buộc mã / tên / loại / đơn vị; mã đúng BUSINESS_CODE_REGEX; tên ≤ 255', () => {
    expect(issues({ ...valid, code: '' })).toContain('code:inventory:materialCodeRequired')
    expect(issues({ ...valid, code: '-x' })).toContain('code:inventory:materialCodeInvalid')
    expect(issues({ ...valid, name: ' ' })).toContain('name:inventory:materialNameRequired')
    expect(issues({ ...valid, name: 'a'.repeat(256) })).toContain(
      'name:inventory:materialNameTooLong',
    )
    expect(issues({ ...valid, typeSlug: '' })).toContain('typeSlug:inventory:materialTypeRequired')
    expect(issues({ ...valid, baseUnitSlug: '' })).toContain(
      'baseUnitSlug:inventory:baseUnitRequired',
    )
  })
})

describe('addMaterialDefaults', () => {
  it('chữ giống mã → ô Mã (viết hoa); ngược lại → ô Tên', () => {
    expect(addMaterialDefaults('vt-09')).toMatchObject({ code: 'VT-09', name: '' })
    expect(addMaterialDefaults('xi măng')).toMatchObject({ code: '', name: 'xi măng' })
    expect(addMaterialDefaults('  ')).toMatchObject({ code: '', name: '' })
  })
})
