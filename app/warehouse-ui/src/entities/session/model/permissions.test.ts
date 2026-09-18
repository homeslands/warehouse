import { describe, expect, it } from 'vitest'
import { ROLES, can, hasRole, safeParseScope, type CurrentUser } from '@/entities/session'

const user = (over: Partial<CurrentUser> = {}): CurrentUser => ({
  userId: 'u1',
  userName: 'root',
  roleName: 'SUPER_ADMIN',
  scope: '[]',
  ...over,
})

describe('safeParseScope', () => {
  it('parse mảng authority hợp lệ', () => {
    expect(safeParseScope('["CREATE_EXAMPLE","READ_EXAMPLE"]')).toEqual([
      'CREATE_EXAMPLE',
      'READ_EXAMPLE',
    ])
  })

  it('trả mảng rỗng với "[]" — đây là trường hợp THỰC TẾ hôm nay', () => {
    expect(safeParseScope('[]')).toEqual([])
  })

  it('trả mảng rỗng với chuỗi rỗng', () => {
    expect(safeParseScope('')).toEqual([])
  })

  it('trả mảng rỗng với null/undefined', () => {
    expect(safeParseScope(null)).toEqual([])
    expect(safeParseScope(undefined)).toEqual([])
  })

  it('trả mảng rỗng với JSON hỏng, không ném lỗi', () => {
    expect(safeParseScope('{ đây không phải json')).toEqual([])
  })

  it('trả mảng rỗng khi JSON hợp lệ nhưng không phải mảng', () => {
    expect(safeParseScope('{"a":1}')).toEqual([])
  })

  it('lọc bỏ phần tử không phải chuỗi', () => {
    expect(safeParseScope('["A",1,null,"B"]')).toEqual(['A', 'B'])
  })
})

describe('ROLES', () => {
  it('khớp đúng giá trị RoleEnum của backend (src/role/role.enum.ts)', () => {
    expect(ROLES).toEqual({
      SUPER_ADMIN: 'SUPER_ADMIN',
      ADMIN: 'ADMIN',
      MANAGER: 'MANAGER',
      SUPERVISOR: 'SUPERVISOR',
    })
  })
})

describe('hasRole', () => {
  it('true khi role của user nằm trong danh sách', () => {
    expect(hasRole(user({ roleName: 'ADMIN' }), ROLES.ADMIN, ROLES.SUPER_ADMIN)).toBe(true)
    expect(hasRole(user({ roleName: 'MANAGER' }), ROLES.ADMIN, ROLES.MANAGER)).toBe(true)
  })

  it('false khi không khớp', () => {
    expect(hasRole(user({ roleName: 'CUSTOMER' }), ROLES.ADMIN, ROLES.SUPER_ADMIN)).toBe(false)
    expect(hasRole(user({ roleName: 'SUPERVISOR' }), ROLES.ADMIN)).toBe(false)
  })

  it('SUPER_ADMIN luôn true, kể cả khi danh sách không có SUPER_ADMIN (khớp bypass của backend)', () => {
    const root = user({ roleName: 'SUPER_ADMIN' })
    expect(hasRole(root, ROLES.ADMIN)).toBe(true)
    expect(hasRole(root, ROLES.MANAGER, ROLES.SUPERVISOR)).toBe(true)
    expect(hasRole(root)).toBe(true)
  })

  it('người thường với danh sách rỗng → false', () => {
    expect(hasRole(user({ roleName: 'ADMIN' }))).toBe(false)
  })

  it('false khi chưa đăng nhập', () => {
    expect(hasRole(null, ROLES.ADMIN)).toBe(false)
    expect(hasRole(null, ROLES.SUPER_ADMIN)).toBe(false)
  })
})

describe('can', () => {
  it('true khi authority có trong scope', () => {
    expect(can(user({ scope: '["CREATE_EXAMPLE"]' }), 'CREATE_EXAMPLE')).toBe(true)
  })

  it('false với SUPER_ADMIN khi scope rỗng — trạng thái thực tế hôm nay', () => {
    expect(can(user({ roleName: 'SUPER_ADMIN', scope: '[]' }), 'CREATE_EXAMPLE')).toBe(false)
  })

  it('false khi chưa đăng nhập', () => {
    expect(can(null, 'CREATE_EXAMPLE')).toBe(false)
  })
})
