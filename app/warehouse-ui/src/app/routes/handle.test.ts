import { describe, expect, it } from 'vitest'
import { readHandle } from './handle'

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
})
