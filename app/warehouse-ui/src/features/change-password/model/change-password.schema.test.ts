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
    expect(messages({ currentPassword: 'a', newPassword: 'b', confirmNewPassword: 'c' })).toEqual({
      confirmNewPassword: 'auth:changePassword.mismatch',
    })
  })

  it('hợp lệ', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'a',
        newPassword: 'b',
        confirmNewPassword: 'b',
      }).success,
    ).toBe(true)
  })
})
