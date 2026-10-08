import { describe, expect, it } from 'vitest'
import { changePasswordSchema } from './change-password.schema'

const messages = (input: unknown) => {
  const r = changePasswordSchema.safeParse(input)
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('changePasswordSchema', () => {
  it('cả ba ô bắt buộc', () => {
    expect(messages({ currentPassword: '', newPassword: '', confirmNewPassword: '' })).toEqual({
      currentPassword: 'auth:changePassword.currentPasswordRequired',
      newPassword: 'auth:changePassword.newPasswordRequired',
      confirmNewPassword: 'auth:changePassword.confirmNewPasswordRequired',
    })
  })

  it('nhập lại không khớp → lỗi ở confirmNewPassword', () => {
    expect(
      messages({ currentPassword: 'a', newPassword: 'matkhau-b', confirmNewPassword: 'matkhau-c' }),
    ).toEqual({
      confirmNewPassword: 'auth:changePassword.mismatch',
    })
  })

  it('mật khẩu mới dưới 8 ký tự → báo tại ô; mật khẩu hiện tại không bị luật độ dài', () => {
    expect(
      messages({ currentPassword: 'a', newPassword: '1234567', confirmNewPassword: '1234567' }),
    ).toEqual({
      newPassword: 'auth:changePassword.newPasswordTooShort',
    })
  })

  it('hợp lệ', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'a',
        newPassword: 'matkhau-b',
        confirmNewPassword: 'matkhau-b',
      }).success,
    ).toBe(true)
  })
})
