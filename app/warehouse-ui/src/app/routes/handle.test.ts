import { describe, expect, it } from 'vitest'
import { hasAuthority, readHandle } from './handle'

describe('readHandle', () => {
  it('authority là chuỗi khác rỗng → giữ nguyên', () => {
    expect(readHandle({ authority: 'MANAGE_PERMISSIONS' })).toEqual({
      authority: 'MANAGE_PERMISSIONS',
    })
  })

  it('authority là chuỗi RỖNG → coi như KHÔNG khai (không được bỏ qua gác quyền)', () => {
    // `can()`/`RoleGate`/`buildNav` kiểm truthy trên `authority` — chuỗi rỗng lọt qua sẽ là
    // fail-open (không gác gì cả), trong khi `roles: []` là fail-closed (chỉ SUPER_ADMIN). Bất đối
    // xứng này không được xảy ra ở bất cứ chỗ nào liên quan tới quyền.
    expect(readHandle({ authority: '' })).toEqual({})
  })

  it('không khai authority → không có trường này trong kết quả', () => {
    expect(readHandle({ roles: [] })).toEqual({ roles: [] })
  })

  it('authority là mảng → giữ các mã khác rỗng; mảng rỗng (sau khi lọc) coi như không khai', () => {
    expect(readHandle({ authority: ['MANAGE_PERMISSIONS', '', 'ROLE_READ'] })).toEqual({
      authority: ['MANAGE_PERMISSIONS', 'ROLE_READ'],
    })
    expect(readHandle({ authority: ['', ''] })).toEqual({})
  })
})

describe('hasAuthority', () => {
  const user = (scope: string[]) => ({ userName: 'a', roleName: 'ADMIN', scope })

  it('một mã → có mã đó; mảng → phải có TẤT CẢ (AND)', () => {
    expect(hasAuthority(user(['MANAGE_PERMISSIONS']), 'MANAGE_PERMISSIONS')).toBe(true)
    expect(hasAuthority(user(['MANAGE_PERMISSIONS']), ['MANAGE_PERMISSIONS', 'ROLE_READ'])).toBe(
      false,
    )
    expect(
      hasAuthority(user(['MANAGE_PERMISSIONS', 'ROLE_READ']), ['MANAGE_PERMISSIONS', 'ROLE_READ']),
    ).toBe(true)
  })

  it('SUPER_ADMIN qua mọi mã', () => {
    expect(
      hasAuthority({ ...user([]), roleName: 'SUPER_ADMIN' }, ['MANAGE_PERMISSIONS', 'ROLE_READ']),
    ).toBe(true)
  })
})
