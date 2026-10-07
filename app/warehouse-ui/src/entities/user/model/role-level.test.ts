import { describe, expect, it } from 'vitest'
import { assignableRoles, canManageTarget, resolveRoleLevel } from './role-level'
import type { Role } from './types'

const role = (name: string, level?: number): Role => ({
  slug: `r-${name.toLowerCase()}`,
  name,
  level,
  authorityCodes: [],
})

// Đúng dữ liệu `GET /roles` trên sandbox 2026-09-30, cộng một vai trò tự tạo.
const ROLES_FROM_API = [
  role('SUPERVISOR', 10),
  role('MANAGER', 20),
  role('ADMIN', 30),
  role('SUPER_ADMIN', 100),
  role('TEAM_LEAD', 15),
]

describe('resolveRoleLevel', () => {
  it('có danh sách vai trò → lấy level backend trả, kể cả vai trò tự tạo', () => {
    expect(resolveRoleLevel('TEAM_LEAD', ROLES_FROM_API)).toBe(15)
    expect(resolveRoleLevel('ADMIN', ROLES_FROM_API)).toBe(30)
  })

  it('không có danh sách (người xem thiếu ROLE_READ) → lùi về bảng vai trò có sẵn', () => {
    expect(resolveRoleLevel('SUPER_ADMIN')).toBe(100)
    expect(resolveRoleLevel('ADMIN')).toBe(30)
    expect(resolveRoleLevel('MANAGER')).toBe(20)
    expect(resolveRoleLevel('SUPERVISOR')).toBe(10)
  })

  it('vai trò lạ không tra được → null (fail-closed)', () => {
    expect(resolveRoleLevel('TEAM_LEAD')).toBeNull()
    expect(resolveRoleLevel('toString')).toBeNull()
  })

  it('vai trò có trong danh sách nhưng thiếu level (fixture cũ) → lùi về bảng có sẵn', () => {
    expect(resolveRoleLevel('MANAGER', [role('MANAGER')])).toBe(20)
  })
})

describe('canManageTarget', () => {
  it('SUPER_ADMIN quản lý được mọi người, kể cả SUPER_ADMIN khác', () => {
    expect(canManageTarget({ roleName: 'SUPER_ADMIN' }, { roleName: 'SUPER_ADMIN' })).toBe(true)
    expect(canManageTarget({ roleName: 'SUPER_ADMIN' }, { roleName: 'TEAM_LEAD' })).toBe(true)
  })

  it('chỉ quản lý được người có cấp THẤP HƠN mình', () => {
    expect(canManageTarget({ roleName: 'ADMIN' }, { roleName: 'MANAGER' })).toBe(true)
    expect(canManageTarget({ roleName: 'ADMIN' }, { roleName: 'ADMIN' })).toBe(false)
    expect(canManageTarget({ roleName: 'MANAGER' }, { roleName: 'ADMIN' })).toBe(false)
  })

  it('MANAGER không có danh sách vai trò gặp vai trò tự tạo → không quản lý được', () => {
    expect(canManageTarget({ roleName: 'MANAGER' }, { roleName: 'TEAM_LEAD' })).toBe(false)
  })

  it('ADMIN có danh sách vai trò → vai trò tự tạo cấp 15 quản lý được', () => {
    expect(canManageTarget({ roleName: 'ADMIN' }, { roleName: 'TEAM_LEAD' }, ROLES_FROM_API)).toBe(
      true,
    )
  })
})

describe('canManageTarget với role.level của target', () => {
  it('cấp của người bị tác động lấy từ target.role.level khi có — không cần danh sách vai trò', () => {
    expect(
      canManageTarget({ roleName: 'MANAGER' }, { roleName: 'TEAM_LEAD', role: { level: 15 } }),
    ).toBe(true)
    expect(
      canManageTarget({ roleName: 'MANAGER' }, { roleName: 'TEAM_LEAD', role: { level: 25 } }),
    ).toBe(false)
  })

  it('phiên cũ chưa có me.role → cấp của mình tra bảng/danh sách — vai trò lạ thì fail-closed', () => {
    expect(
      canManageTarget({ roleName: 'GHOST' }, { roleName: 'SUPERVISOR', role: { level: 10 } }),
    ).toBe(false)
  })
})

describe('cấp của chính mình lấy từ me.role.level (/auth/me trả từ PR #80)', () => {
  const lead = { roleName: 'KHO_TRUONG', role: { level: 25 } }

  it('vai trò tự tạo, KHÔNG có danh sách vai trò → vẫn quản lý được người cấp thấp hơn', () => {
    expect(canManageTarget(lead, { roleName: 'MANAGER', role: { level: 20 } })).toBe(true)
    expect(canManageTarget(lead, { roleName: 'ADMIN', role: { level: 30 } })).toBe(false)
    expect(canManageTarget(lead, { roleName: 'KHO_TRUONG', role: { level: 25 } })).toBe(false)
  })

  it('me.role.level thắng bảng có sẵn (backend đổi level của vai trò có sẵn)', () => {
    expect(
      canManageTarget(
        { roleName: 'MANAGER', role: { level: 12 } },
        { roleName: 'TEAM_LEAD', role: { level: 15 } },
      ),
    ).toBe(false)
  })

  it('assignableRoles dùng me.role.level', () => {
    expect(assignableRoles(lead, ROLES_FROM_API).map((r) => r.name)).toEqual([
      'SUPERVISOR',
      'MANAGER',
      'TEAM_LEAD',
    ])
  })
})

describe('assignableRoles', () => {
  it('ADMIN chỉ gán được vai trò cấp thấp hơn 30', () => {
    expect(assignableRoles({ roleName: 'ADMIN' }, ROLES_FROM_API).map((r) => r.name)).toEqual([
      'SUPERVISOR',
      'MANAGER',
      'TEAM_LEAD',
    ])
  })

  it('SUPER_ADMIN gán được mọi vai trò trừ SUPER_ADMIN', () => {
    expect(assignableRoles({ roleName: 'SUPER_ADMIN' }, ROLES_FROM_API).map((r) => r.name)).toEqual(
      ['SUPERVISOR', 'MANAGER', 'ADMIN', 'TEAM_LEAD'],
    )
  })

  it('vai trò của mình không tra được cấp → không gán được gì', () => {
    expect(assignableRoles({ roleName: 'GHOST' }, ROLES_FROM_API)).toEqual([])
  })
})
