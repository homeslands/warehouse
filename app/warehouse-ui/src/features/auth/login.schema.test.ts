import { describe, expect, it } from 'vitest'
import { loginSchema } from '@/features/auth/login.schema'

describe('loginSchema', () => {
  it('chấp nhận số điện thoại và mật khẩu hợp lệ', () => {
    expect(loginSchema.safeParse({ phonenumber: '0376295216', password: 'secret' }).success).toBe(
      true,
    )
  })

  it('chấp nhận `root` — tài khoản seed không phải số điện thoại thật', () => {
    expect(loginSchema.safeParse({ phonenumber: 'root', password: 'root' }).success).toBe(true)
  })

  it('từ chối phonenumber rỗng', () => {
    expect(loginSchema.safeParse({ phonenumber: '', password: 'secret' }).success).toBe(false)
  })

  it('từ chối password rỗng', () => {
    expect(loginSchema.safeParse({ phonenumber: '0376295216', password: '' }).success).toBe(false)
  })
})
