import { describe, expect, it } from 'vitest'
import {
  EMPTY_SUPPLIER_FORM,
  supplierFormSchema,
  toCreateInput,
  toUpdateInput,
} from './supplier-form.schema'

const valid = { ...EMPTY_SUPPLIER_FORM, code: 'NCC-HN-01', name: 'Công ty ABC' }
const errorsOf = (values: typeof valid) => {
  const r = supplierFormSchema.safeParse(values)
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('supplierFormSchema', () => {
  it('hợp lệ tối thiểu: mã + tên', () => expect(errorsOf(valid)).toEqual({}))

  it.each(['-NCC', 'NCC-', 'A', 'NCC 01', 'x'.repeat(33)])('mã "%s" sai định dạng', (code) => {
    expect(errorsOf({ ...valid, code })).toEqual({ code: 'suppliers:codeInvalid' })
  })

  it.each(['0101234567', '0101234567-001'])('MST "%s" hợp lệ', (taxCode) => {
    expect(errorsOf({ ...valid, taxCode })).toEqual({})
  })

  it.each(['12345', '01012345678', '0101234567-01'])('MST "%s" sai', (taxCode) => {
    expect(errorsOf({ ...valid, taxCode })).toEqual({ taxCode: 'suppliers:taxCodeInvalid' })
  })

  it.each(['12345678', '0123', '012345678901'])('SĐT "%s" sai (0 + 8–10 số)', (phonenumber) => {
    expect(errorsOf({ ...valid, phonenumber })).toEqual({
      phonenumber: 'suppliers:phonenumberInvalid',
    })
  })

  it('tên > 255, ghi chú > 1000 → quá dài', () => {
    expect(errorsOf({ ...valid, name: 'x'.repeat(256), note: 'y'.repeat(1001) })).toEqual({
      name: 'suppliers:tooLong',
      note: 'suppliers:noteTooLong',
    })
  })
})

describe('toCreateInput / toUpdateInput', () => {
  it('tạo: trim, bỏ ô tuỳ chọn trống', () => {
    expect(toCreateInput({ ...valid, code: ' ncc-hn-01 ', email: '  ' })).toEqual({
      code: 'ncc-hn-01',
      name: 'Công ty ABC',
    })
  })

  it('sửa: chỉ gửi trường ĐÃ ĐỔI; ô tuỳ chọn bị xoá trống KHÔNG gửi (backend chưa xoá trống được)', () => {
    const original = {
      slug: 's',
      createdAt: '',
      updatedAt: '',
      code: 'NCC1',
      name: 'A',
      email: 'a@x.vn',
      taxCode: null,
      phonenumber: null,
      address: null,
      contactPerson: null,
      note: null,
    }
    expect(toUpdateInput({ ...valid, code: 'NCC1', name: 'B', email: '' }, original)).toEqual({
      name: 'B',
    })
  })
})
