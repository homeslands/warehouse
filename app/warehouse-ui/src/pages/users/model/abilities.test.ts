import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import type { Role, User } from '@/entities/user'
import { hasAnyRowAbility, isSelf, userAbilities } from './abilities'

// Quyền thật trên sandbox 2026-09-30 (phần liên quan).
const ROOT: CurrentUser = { userName: 'root', roleName: 'SUPER_ADMIN', scope: [] }
const ADMIN: CurrentUser = {
  userName: '0310000000',
  roleName: 'ADMIN',
  scope: ['USER_READ', 'USER_CREATE', 'USER_CHANGE_PASSWORD', 'ROLE_READ'],
}
const MANAGER: CurrentUser = {
  userName: '0340000000',
  roleName: 'MANAGER',
  scope: ['USER_READ', 'USER_CHANGE_PASSWORD'],
}
const SUPERVISOR: CurrentUser = {
  userName: '0330000000',
  roleName: 'SUPERVISOR',
  scope: [],
}

const ROLES: Role[] = [
  { slug: 'r-sup', name: 'SUPERVISOR', level: 10, authorityCodes: [] },
  { slug: 'r-man', name: 'MANAGER', level: 20, authorityCodes: [] },
  { slug: 'r-adm', name: 'ADMIN', level: 30, authorityCodes: [] },
  { slug: 'r-sa', name: 'SUPER_ADMIN', level: 100, authorityCodes: [] },
  { slug: 'r-tl', name: 'TEAM_LEAD', level: 15, authorityCodes: [] },
]

const target = (roleName: string, phonenumber = '0399999999'): User => ({
  slug: `t-${roleName}`,
  createdAt: '',
  updatedAt: '',
  phonenumber,
  isActive: true,
  roleSlug: `r-${roleName}`,
  roleName,
})

const OFF = { userUpdate: false, userStatus: false, userSearch: false }
const ON = { userUpdate: true, userStatus: true, userSearch: true }

describe('isSelf', () => {
  it('có userSlug (/auth/me từ PR #80) → so bằng slug', () => {
    const me = { ...ADMIN, userSlug: 't-ADMIN' }
    expect(isSelf(me, target('ADMIN', '0399999999'))).toBe(true)
    expect(isSelf(me, target('MANAGER', '0310000000'))).toBe(false)
  })

  it('phiên cũ chưa có userSlug → lùi về so phonenumber với userName', () => {
    expect(isSelf(ADMIN, target('ADMIN', '0310000000'))).toBe(true)
    expect(isSelf(ADMIN, target('ADMIN', '0310000001'))).toBe(false)
    expect(isSelf(null, target('ADMIN'))).toBe(false)
  })
})

describe('cấp của chính mình từ me.role.level (PR #80)', () => {
  it('vai trò tự tạo cấp 25, không có ROLE_READ → reset được cho MANAGER, không cho ADMIN', () => {
    const me: CurrentUser = {
      userName: 'to-truong',
      roleName: 'TO_TRUONG',
      role: { slug: 'r-tt', name: 'TO_TRUONG', level: 25 },
      scope: ['USER_READ', 'USER_CHANGE_PASSWORD'],
    }
    const a = userAbilities(me, undefined, ON)
    expect(
      a.row({ ...target('MANAGER'), role: { slug: 'r-man', name: 'MANAGER', level: 20 } })
        .resetPassword,
    ).toBe(true)
    expect(
      a.row({ ...target('ADMIN'), role: { slug: 'r-adm', name: 'ADMIN', level: 30 } })
        .resetPassword,
    ).toBe(false)
  })
})

describe('userAbilities — phần backend đang có (cờ tắt)', () => {
  it('ADMIN: tạo được, lọc theo vai trò được, reset được cho MANAGER/SUPERVISOR', () => {
    const a = userAbilities(ADMIN, ROLES, OFF)
    expect(a.create).toBe(true)
    expect(a.filterByRole).toBe(true)
    expect(a.search).toBe(false)
    expect(a.row(target('MANAGER')).resetPassword).toBe(true)
    expect(a.row(target('SUPERVISOR')).resetPassword).toBe(true)
  })

  it('ADMIN: KHÔNG reset cho ADMIN khác, SUPER_ADMIN, hay chính mình', () => {
    const a = userAbilities(ADMIN, ROLES, OFF)
    expect(a.row(target('ADMIN')).resetPassword).toBe(false)
    expect(a.row(target('SUPER_ADMIN')).resetPassword).toBe(false)
    expect(a.row(target('SUPERVISOR', '0310000000')).resetPassword).toBe(false)
  })

  it('MANAGER (không ROLE_READ): không tạo, không lọc vai trò; reset cho SUPERVISOR nhưng KHÔNG cho ADMIN', () => {
    // Backend hiện CHO manager reset admin (bug đã báo) — FE không được mời làm việc đó.
    const a = userAbilities(MANAGER, undefined, OFF)
    expect(a.create).toBe(false)
    expect(a.filterByRole).toBe(false)
    expect(a.row(target('SUPERVISOR')).resetPassword).toBe(true)
    expect(a.row(target('ADMIN')).resetPassword).toBe(false)
    expect(a.row(target('MANAGER')).resetPassword).toBe(false)
  })

  it('MANAGER gặp vai trò tự tạo không tra được cấp → không nút nào (fail-closed)', () => {
    const row = userAbilities(MANAGER, undefined, ON).row(target('TEAM_LEAD'))
    expect(hasAnyRowAbility(row)).toBe(false)
  })

  it('USER_CREATE mà thiếu ROLE_READ → không tạo được (ô chọn vai trò cần GET /roles)', () => {
    const me = { ...ADMIN, scope: ['USER_READ', 'USER_CREATE'] }
    expect(userAbilities(me, undefined, OFF).create).toBe(false)
  })

  it('SUPER_ADMIN: reset cho mọi người trừ chính mình', () => {
    const a = userAbilities(ROOT, ROLES, OFF)
    expect(a.row(target('SUPER_ADMIN', 'other-root')).resetPassword).toBe(true)
    expect(a.row(target('SUPER_ADMIN', 'root')).resetPassword).toBe(false)
  })

  it('SUPERVISOR: không làm được gì', () => {
    const a = userAbilities(SUPERVISOR, undefined, ON)
    expect(a.create).toBe(false)
    expect(hasAnyRowAbility(a.row(target('SUPERVISOR', '0399')))).toBe(false)
  })

  it('cờ tắt → sửa/đổi vai trò/khoá luôn false, kể cả SUPER_ADMIN', () => {
    const row = userAbilities(ROOT, ROLES, OFF).row(target('MANAGER'))
    expect(row).toEqual({
      resetPassword: true,
      edit: false,
      changeRole: false,
      toggleActive: false,
    })
  })
})

describe('userAbilities — sửa / đổi vai trò / khoá (USER_UPDATE, PR #72)', () => {
  const FULL = [...ADMIN.scope, 'USER_UPDATE']

  it('ADMIN có USER_UPDATE → sửa, đổi vai trò, khoá được MANAGER đang hoạt động', () => {
    const a = userAbilities({ ...ADMIN, scope: FULL }, ROLES, ON)
    expect(a.search).toBe(true)
    expect(a.row(target('MANAGER'))).toEqual({
      resetPassword: true,
      edit: true,
      changeRole: true,
      toggleActive: true,
    })
  })

  it('một mã USER_UPDATE gác cả ba thao tác; thiếu nó thì không có thao tác nào trong ba', () => {
    expect(userAbilities(ADMIN, ROLES, ON).row(target('MANAGER'))).toMatchObject({
      edit: false,
      changeRole: false,
      toggleActive: false,
    })
  })

  it('tài khoản đã khoá vẫn có thao tác (Mở khoá) — cùng mã USER_UPDATE', () => {
    const locked = { ...target('MANAGER'), isActive: false }
    expect(userAbilities({ ...ADMIN, scope: FULL }, ROLES, ON).row(locked).toggleActive).toBe(true)
  })

  it('đổi vai trò cần thêm ROLE_READ (ô chọn vai trò tải GET /roles); sửa hồ sơ thì không', () => {
    const me = { ...MANAGER, scope: [...MANAGER.scope, 'USER_UPDATE'] }
    const row = userAbilities(me, undefined, ON).row(target('SUPERVISOR'))
    expect(row.changeRole).toBe(false)
    expect(row.edit).toBe(true)
  })

  it('không sửa/khoá/đổi vai trò chính mình, không đụng người cùng cấp (ADMIN↔ADMIN = 100417)', () => {
    const a = userAbilities({ ...ADMIN, scope: FULL }, ROLES, ON)
    expect(hasAnyRowAbility(a.row(target('SUPERVISOR', '0310000000')))).toBe(false)
    expect(hasAnyRowAbility(a.row(target('ADMIN')))).toBe(false)
  })

  it('không có thao tác xoá người dùng (nghiệp vụ chốt: chỉ khoá)', () => {
    const row = userAbilities({ ...ADMIN, scope: [...FULL, 'USER_DELETE'] }, ROLES, ON).row(
      target('MANAGER'),
    )
    expect(Object.keys(row).sort()).toEqual(['changeRole', 'edit', 'resetPassword', 'toggleActive'])
  })

  it('vai trò tự tạo (không tra được cấp) fail-closed dù có USER_UPDATE', () => {
    const me = { ...MANAGER, scope: [...MANAGER.scope, 'USER_UPDATE'] }
    expect(hasAnyRowAbility(userAbilities(me, undefined, ON).row(target('TEAM_LEAD')))).toBe(false)
  })
})

describe('userAbilities — chưa đăng nhập', () => {
  it('me = null → không tạo, không lọc vai trò, không thao tác nào trên dòng nào', () => {
    const a = userAbilities(null, ROLES, ON)
    expect(a.create).toBe(false)
    expect(a.filterByRole).toBe(false)
    expect(hasAnyRowAbility(a.row(target('SUPERVISOR')))).toBe(false)
  })
})
