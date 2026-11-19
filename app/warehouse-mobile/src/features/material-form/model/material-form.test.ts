import type { Material } from '@/entities/material'
import {
  EMPTY_MATERIAL_FORM,
  isMaterialDirty,
  toMaterialCreateInput,
  toMaterialFormValues,
  toMaterialUpdateInput,
  validateMaterialForm,
  type MaterialFormValues,
} from './material-form'

const type = { slug: 't1', code: 'T1', name: 'Loại 1' }
const unit = { slug: 'u1', code: 'KG', name: 'Kilogram' }
const unit2 = { slug: 'u2', code: 'G', name: 'Gram' }
const valid: MaterialFormValues = {
  code: 'vt-01',
  name: 'Vật tư 1',
  type,
  baseUnit: unit,
  min: '',
  max: '',
}
const original = {
  slug: 'm1',
  code: 'VT-01',
  name: 'Vật tư 1',
  minimumInventory: 0,
  maximumInventory: 10,
  type,
  baseUnit: unit,
} as unknown as Material

describe('validateMaterialForm', () => {
  it('form đủ → không lỗi', () => expect(validateMaterialForm(valid)).toEqual({}))
  it('mã/tên', () => {
    expect(validateMaterialForm({ ...valid, code: ' ', name: '' })).toEqual({
      code: 'required',
      name: 'required',
    })
    expect(validateMaterialForm({ ...valid, code: 'a' }).code).toBe('codeInvalid')
    expect(validateMaterialForm({ ...valid, name: 'x'.repeat(256) }).name).toBe('tooLong')
  })
  it('type/baseUnit null', () => {
    expect(validateMaterialForm({ ...valid, type: null })).toEqual({ type: 'required' })
    expect(validateMaterialForm({ ...valid, baseUnit: null })).toEqual({ baseUnit: 'required' })
  })
  it('min > max (max trống = 0)', () => {
    expect(validateMaterialForm({ ...valid, min: '5' })).toEqual({ max: 'rangeInvalid' })
    expect(validateMaterialForm({ ...valid, min: '5', max: '3' })).toEqual({ max: 'rangeInvalid' })
    expect(validateMaterialForm({ ...valid, min: '3', max: '3' })).toEqual({})
  })
  it('số không hợp lệ', () => {
    expect(validateMaterialForm({ ...valid, min: '1.1234567' })).toEqual({ min: 'numberInvalid' })
    expect(validateMaterialForm({ ...valid, max: '1e12' })).toEqual({ max: 'numberInvalid' })
    expect(validateMaterialForm({ ...valid, max: '1000000000000' })).toEqual({
      max: 'numberInvalid',
    })
  })
})

describe('toMaterialFormValues', () => {
  it('0 → rỗng, khác 0 → chuỗi', () => {
    expect(toMaterialFormValues(original)).toEqual({
      code: 'VT-01',
      name: 'Vật tư 1',
      type,
      baseUnit: unit,
      min: '',
      max: '10',
    })
  })
})

describe('toMaterialCreateInput', () => {
  it('chuẩn hoá, không gửi min/max khi trống', () => {
    expect(toMaterialCreateInput({ ...valid, name: ' Vật tư 1 ' })).toEqual({
      code: 'VT-01',
      name: 'Vật tư 1',
      typeSlug: 't1',
      baseUnitSlug: 'u1',
    })
  })
  it('gửi min/max khi > 0', () => {
    expect(toMaterialCreateInput({ ...valid, min: '2', max: '5.5' })).toMatchObject({
      minimumInventory: 2,
      maximumInventory: 5.5,
    })
  })
})

describe('toMaterialUpdateInput', () => {
  const same = toMaterialFormValues(original)
  it('không đổi (mã khác hoa/thường, 10.0 == 10)', () => {
    expect(toMaterialUpdateInput({ ...same, code: 'vt-01', max: '10.0' }, original)).toEqual({})
  })
  it('đổi baseUnit → chỉ baseUnitSlug', () => {
    expect(toMaterialUpdateInput({ ...same, baseUnit: unit2 }, original)).toEqual({
      baseUnitSlug: 'u2',
    })
  })
  it('đổi tên, loại, min', () => {
    expect(
      toMaterialUpdateInput(
        { ...same, name: 'Mới', type: { ...type, slug: 't2' }, min: '1' },
        original,
      ),
    ).toEqual({ name: 'Mới', typeSlug: 't2', minimumInventory: 1 })
  })
  it('xoá max → 0', () => {
    expect(toMaterialUpdateInput({ ...same, max: '' }, original)).toEqual({ maximumInventory: 0 })
  })
})

describe('isMaterialDirty', () => {
  it('form trống, tạo mới → false', () =>
    expect(isMaterialDirty(EMPTY_MATERIAL_FORM, null)).toBe(false))
  it('tạo mới có nhập → true', () => {
    expect(isMaterialDirty({ ...EMPTY_MATERIAL_FORM, type }, null)).toBe(true)
    expect(isMaterialDirty({ ...EMPTY_MATERIAL_FORM, max: '1' }, null)).toBe(true)
  })
  it('sửa', () => {
    expect(isMaterialDirty(toMaterialFormValues(original), original)).toBe(false)
    expect(isMaterialDirty({ ...toMaterialFormValues(original), name: 'x' }, original)).toBe(true)
  })
})
