import { describe, expect, it } from 'vitest'
import {
  toCreateInput,
  toUpdateInput,
  userFormSchema,
  type UserFormValues,
} from './user-form.schema'

const TODAY = new Date(2026, 8, 30)
const valid: UserFormValues = {
  phonenumber: '0390000001',
  lastName: 'Nguyễn',
  firstName: 'Văn A',
  password: 'matkhau1',
  confirmPassword: 'matkhau1',
  roleSlug: 'r-sup',
  dob: undefined,
  email: '',
  address: '',
}

const errorsOf = (mode: 'create' | 'edit', values: UserFormValues) => {
  const result = userFormSchema(mode, TODAY).safeParse(values)
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('userFormSchema — tạo', () => {
  it('dữ liệu hợp lệ qua', () => {
    expect(errorsOf('create', valid)).toEqual({})
  })

  it('báo ĐỦ mọi ô sai cùng lúc (backend chỉ trả lỗi đầu tiên)', () => {
    expect(
      errorsOf('create', {
        ...valid,
        phonenumber: '0123456789',
        lastName: ' ',
        firstName: '',
        password: '',
        confirmPassword: '',
        roleSlug: '',
        email: 'abc',
        dob: '2026-10-01',
      }),
    ).toEqual({
      phonenumber: 'users:phonenumberInvalid',
      lastName: 'users:lastNameRequired',
      firstName: 'users:firstNameRequired',
      password: 'users:passwordRequired',
      confirmPassword: 'users:confirmPasswordRequired',
      roleSlug: 'users:roleRequired',
      email: 'users:emailInvalid',
      dob: 'users:dobFuture',
    })
  })

  it('mật khẩu nhập lại không khớp', () => {
    expect(errorsOf('create', { ...valid, confirmPassword: 'y' })).toEqual({
      confirmPassword: 'users:passwordMismatch',
    })
  })

  it('mật khẩu dưới 8 ký tự → báo tại ô (lớp chặn tạm, backend chưa có chính sách)', () => {
    expect(
      errorsOf('create', { ...valid, password: '1234567', confirmPassword: '1234567' }),
    ).toEqual({ password: 'users:passwordTooShort' })
    expect(
      errorsOf('create', { ...valid, password: '12345678', confirmPassword: '12345678' }),
    ).toEqual({})
  })

  it('ngày sinh hôm nay vẫn hợp lệ', () => {
    expect(errorsOf('create', { ...valid, dob: '2026-09-30' })).toEqual({})
  })
})

describe('userFormSchema — giới hạn độ dài (cột DB varchar 255)', () => {
  it.each(['lastName', 'firstName', 'address'] as const)(
    '%s quá 255 ký tự → users:tooLong',
    (field) => {
      expect(errorsOf('create', { ...valid, [field]: 'x'.repeat(256) })[field]).toBe(
        'users:tooLong',
      )
      expect(errorsOf('create', { ...valid, [field]: 'x'.repeat(255) })[field]).toBeUndefined()
    },
  )

  it('email quá 255 ký tự → users:tooLong', () => {
    const email = `${'a'.repeat(250)}@example.com`
    expect(errorsOf('create', { ...valid, email }).email).toBe('users:tooLong')
  })
})

describe('userFormSchema — sửa', () => {
  const editErrors = (values: UserFormValues, originalPhone: string) => {
    const result = userFormSchema('edit', TODAY, originalPhone).safeParse(values)
    return result.success
      ? {}
      : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))
  }
  const editing = { ...valid, password: '', confirmPassword: '', roleSlug: '' }

  it('không đòi mật khẩu, không đòi vai trò (đổi vai trò đi dialog riêng)', () => {
    expect(editErrors(editing, '0390000001')).toEqual({})
  })

  it('SĐT giữ nguyên thì không kiểm định dạng (tài khoản cũ như "root" vẫn lưu được)', () => {
    expect(editErrors({ ...editing, phonenumber: 'root' }, 'root')).toEqual({})
  })

  it('SĐT đã đổi thì phải đúng định dạng; để trống thì báo bắt buộc', () => {
    expect(editErrors({ ...editing, phonenumber: '0123' }, 'root')).toEqual({
      phonenumber: 'users:phonenumberInvalid',
    })
    expect(editErrors({ ...editing, phonenumber: '' }, 'root')).toEqual({
      phonenumber: 'users:phonenumberRequired',
    })
  })
})

describe('toCreateInput / toUpdateInput', () => {
  it('tạo: trim, bỏ hẳn trường tuỳ chọn trống (backend không nhận chuỗi rỗng)', () => {
    expect(toCreateInput({ ...valid, lastName: ' Nguyễn ', email: '  ', address: '' })).toEqual({
      phonenumber: '0390000001',
      lastName: 'Nguyễn',
      firstName: 'Văn A',
      password: 'matkhau1',
      roleSlug: 'r-sup',
    })
    expect(
      toCreateInput({ ...valid, dob: '1990-05-20', email: 'a@b.vn', address: 'HN' }),
    ).toMatchObject({
      dob: '1990-05-20',
      email: 'a@b.vn',
      address: 'HN',
    })
  })

  const original = {
    phonenumber: '0390000001',
    lastName: 'Nguyễn',
    firstName: 'Văn A',
    dob: '1990-05-20',
    email: 'a@b.vn',
    address: 'HN',
  }
  const unchanged: UserFormValues = { ...valid, ...original }

  it('sửa: chỉ gửi trường đã đổi (trim); không bao giờ gửi mật khẩu/vai trò', () => {
    expect(toUpdateInput(unchanged, original)).toEqual({})
    expect(
      toUpdateInput({ ...unchanged, phonenumber: ' 0390000002 ', firstName: 'Văn B' }, original),
    ).toEqual({ phonenumber: '0390000002', firstName: 'Văn B' })
  })

  it('sửa: xoá trống trường tuỳ chọn → bỏ qua (backend chưa xoá được), không gửi null', () => {
    expect(
      toUpdateInput({ ...unchanged, dob: undefined, email: '', address: '  ' }, original),
    ).toEqual({})
    expect(toUpdateInput({ ...unchanged, email: 'c@d.vn' }, { ...original, email: null })).toEqual({
      email: 'c@d.vn',
    })
  })
})
