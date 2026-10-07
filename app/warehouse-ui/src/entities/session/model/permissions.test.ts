import { describe, expect, it } from 'vitest'
import { ROLES, can, hasRole, safeParseScope, type CurrentUser } from '@/entities/session'

const user = (over: Partial<CurrentUser> = {}): CurrentUser => ({
  userName: 'root',
  roleName: 'SUPER_ADMIN',
  scope: [],
  ...over,
})

describe('safeParseScope — nhận MẢNG, không phải chuỗi JSON', () => {
  it('mảng chuỗi giữ nguyên', () => {
    expect(safeParseScope(['IMPORT_FORM_CREATE', 'USER_READ'])).toEqual([
      'IMPORT_FORM_CREATE',
      'USER_READ',
    ])
  })

  it('mảng lẫn kiểu khác → lọc bỏ phần không phải chuỗi', () => {
    expect(safeParseScope(['A', 1, null, 'B'])).toEqual(['A', 'B'])
  })

  it.each([undefined, null, 'A,B', 42, {}])('%s không phải mảng → []', (raw) => {
    expect(safeParseScope(raw)).toEqual([])
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
  it('có quyền trong scope → true', () => {
    // roleName khác SUPER_ADMIN: nếu để mặc định (user() = SUPER_ADMIN) thì bypass ở dòng dưới
    // che mất nhánh đang cần kiểm — test sẽ xanh dù can() không đọc scope.
    expect(
      can(user({ roleName: 'ADMIN', scope: ['MANAGE_PERMISSIONS'] }), 'MANAGE_PERMISSIONS'),
    ).toBe(true)
  })

  it('không có → false', () => {
    // Cùng lý do trên: bắt buộc roleName khác SUPER_ADMIN, nếu không bypass luôn thắng và
    // assertion `false` sẽ đỏ oan dù can() đúng.
    expect(can(user({ roleName: 'ADMIN', scope: ['USER_READ'] }), 'MANAGE_PERMISSIONS')).toBe(false)
  })

  it('SUPER_ADMIN luôn true dù scope RỖNG', () => {
    // AuthorityGuard của backend cho SUPER_ADMIN qua TRƯỚC khi nhìn scope, và migration cố tình
    // không cấp row permission nào cho nó (tài khoản root thật có scope: []). Thiếu bypass này
    // thì người quyền cao nhất là người duy nhất bị FE đá khỏi màn phân quyền.
    expect(can(user({ roleName: 'SUPER_ADMIN', scope: [] }), 'MANAGE_PERMISSIONS')).toBe(true)
  })

  it('không đăng nhập → false', () => {
    expect(can(null, 'MANAGE_PERMISSIONS')).toBe(false)
  })
})

describe('can — mã quyền có kiểu', () => {
  it('gõ sai mã là lỗi BIÊN DỊCH, không phải `false` âm thầm lúc chạy', () => {
    // `npm run typecheck` đỏ nếu dòng dưới KHÔNG còn là lỗi kiểu — tức `can()` lại nhận `string`.
    // @ts-expect-error — 'WAREHOUSE_CREAT' không phải AuthorityCode
    expect(can(null, 'WAREHOUSE_CREAT')).toBe(false)
  })
})
