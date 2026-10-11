import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import type { Role } from '@/entities/user'
import { canActOnRole, roleAbilities } from './abilities'

const u = (scope: string[], roleName = 'ADMIN', level = 30): CurrentUser => ({
  userName: 'u',
  roleName,
  scope,
  role: { slug: roleName.toLowerCase(), name: roleName, level },
})
const r = (name: string, level?: number): Role => ({ slug: name, name, level, authorityCodes: [] })

describe('roleAbilities', () => {
  it('mỗi nút một mã; Mở phân quyền cần MANAGE_PERMISSIONS + ROLE_READ; link người dùng cần USER_READ', () => {
    expect(roleAbilities(u(['ROLE_READ']))).toEqual({
      create: false,
      update: false,
      delete: false,
      openPermissions: false,
      viewUsers: false,
    })
    expect(roleAbilities(u(['MANAGE_PERMISSIONS'])).openPermissions).toBe(false)
    expect(
      roleAbilities(
        u([
          'ROLE_READ',
          'ROLE_CREATE',
          'ROLE_UPDATE',
          'ROLE_DELETE',
          'MANAGE_PERMISSIONS',
          'USER_READ',
        ]),
      ),
    ).toEqual({ create: true, update: true, delete: true, openPermissions: true, viewUsers: true })
    expect(roleAbilities(null).create).toBe(false)
  })
})

describe('canActOnRole', () => {
  const roles = [r('ADMIN', 30), r('MANAGER', 20), r('Trưởng nhóm', 15)]

  it('chỉ vai trò cấp thấp hơn mình; chính mình / ngang / cao hơn → không; SUPER_ADMIN được hết', () => {
    expect(canActOnRole(u([]), r('Trưởng nhóm', 15), roles)).toBe(true)
    expect(canActOnRole(u([]), r('ADMIN', 30), roles)).toBe(false)
    expect(canActOnRole(u([]), r('Quản lý vùng', 30), roles)).toBe(false)
    expect(canActOnRole(u([], 'Trưởng nhóm', 15), r('MANAGER', 20), roles)).toBe(false)
    expect(canActOnRole(u([], 'Trưởng nhóm', 15), r('SUPERVISOR', 10), roles)).toBe(true)
    expect(canActOnRole(u([], 'SUPER_ADMIN', 100), r('ADMIN', 30), roles)).toBe(true)
  })

  it('vai trò tự tạo thiếu level / chưa đăng nhập → không (fail-closed)', () => {
    expect(canActOnRole(u([]), r('Không cấp'), roles)).toBe(false)
    expect(canActOnRole(null, r('Trưởng nhóm', 15), roles)).toBe(false)
  })
})
