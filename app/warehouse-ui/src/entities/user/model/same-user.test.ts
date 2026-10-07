import { describe, expect, it } from 'vitest'
import { isSameUser } from './same-user'

const target = { slug: 'u-lan', phonenumber: '0390000001' }

describe('isSameUser', () => {
  it('có userSlug (/auth/me từ PR #80) → so bằng slug', () => {
    expect(isSameUser({ userSlug: 'u-lan', userName: 'khac' }, target)).toBe(true)
    // Cùng SĐT nhưng khác slug → không phải mình (slug là định danh duy nhất).
    expect(isSameUser({ userSlug: 'u-khac', userName: '0390000001' }, target)).toBe(false)
  })

  it('phiên cũ chưa có userSlug → lùi về so định danh đăng nhập', () => {
    expect(isSameUser({ userName: '0390000001' }, target)).toBe(true)
    expect(isSameUser({ userName: '0390000002' }, target)).toBe(false)
  })

  it('chưa đăng nhập → false', () => {
    expect(isSameUser(null, target)).toBe(false)
  })
})
