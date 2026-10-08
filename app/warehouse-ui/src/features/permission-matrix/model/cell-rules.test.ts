import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import type { Role } from '@/entities/user'
import { cellLock } from './cell-rules'

// Đối chiếu từng ca với mục 12 của docs/proposals/2026-09-25-permission-delegation-rules.md —
// FE phải khoá đúng những ô backend sẽ từ chối.

const actor = (roleName: string, scope: string[] = []): CurrentUser => ({
  userName: 't',
  roleName,
  scope,
})
const role = (name: string, authorityCodes: string[] = []): Role => ({
  slug: name.toLowerCase(),
  name,
  authorityCodes,
})

type Args = Parameters<typeof cellLock>[0]
const base = (over: Partial<Args>): Args => ({
  actor: actor('MANAGER'),
  role: role('SUPERVISOR'),
  code: 'IMPORT_FORM_CREATE',
  granted: false,
  manageHolderCount: 2,
  delegationRules: true,
  ...over,
})

describe('cellLock — cờ TẮT (backend chưa có luật ủy quyền)', () => {
  it('không khoá theo cấp bậc / trần quyền / mã đặc biệt', () => {
    expect(
      cellLock(base({ delegationRules: false, role: role('ADMIN'), code: 'MANAGE_PERMISSIONS' })),
    ).toBeNull()
  })

  it('vẫn giữ khoá "vai trò cuối cùng" như trước', () => {
    expect(
      cellLock(
        base({
          delegationRules: false,
          code: 'MANAGE_PERMISSIONS',
          granted: true,
          manageHolderCount: 1,
        }),
      ),
    ).toBe('lastKey')
  })
})

describe('cellLock — cờ BẬT', () => {
  it('#1 MANAGER sửa cột MANAGER (chính mình) → rank', () => {
    expect(cellLock(base({ role: role('MANAGER') }))).toBe('rank')
  })

  it('#2 MANAGER sửa cột ADMIN (cao hơn) → rank', () => {
    expect(cellLock(base({ role: role('ADMIN') }))).toBe('rank')
  })

  it('#3 MANAGER có mã, cấp cho SUPERVISOR → sửa được', () => {
    expect(cellLock(base({ actor: actor('MANAGER', ['IMPORT_FORM_CREATE']) }))).toBeNull()
  })

  it('#4 MANAGER không có mã, cấp cho SUPERVISOR → notHeld', () => {
    expect(cellLock(base({ code: 'WAREHOUSE_DELETE' }))).toBe('notHeld')
  })

  it('#5 MANAGER không có mã, GỠ của SUPERVISOR → notHeld (mặc định (a) đối xứng)', () => {
    expect(cellLock(base({ code: 'WAREHOUSE_DELETE', granted: true }))).toBe('notHeld')
  })

  it('#6 ADMIN cấp MANAGE_PERMISSIONS cho MANAGER → protected', () => {
    expect(
      cellLock(
        base({
          actor: actor('ADMIN', ['MANAGE_PERMISSIONS']),
          role: role('MANAGER'),
          code: 'MANAGE_PERMISSIONS',
        }),
      ),
    ).toBe('protected')
  })

  it('#7 SUPER_ADMIN cấp MANAGE_PERMISSIONS cho MANAGER → sửa được', () => {
    expect(
      cellLock(
        base({ actor: actor('SUPER_ADMIN'), role: role('MANAGER'), code: 'MANAGE_PERMISSIONS' }),
      ),
    ).toBeNull()
  })

  it('#8 ADMIN sửa cột ADMIN → rank', () => {
    expect(
      cellLock(base({ actor: actor('ADMIN', ['IMPORT_FORM_CREATE']), role: role('ADMIN') })),
    ).toBe('rank')
  })

  it('#10 SUPER_ADMIN gỡ MANAGE_PERMISSIONS khỏi vai trò cuối cùng → lastKey (R4 áp cả SUPER_ADMIN)', () => {
    expect(
      cellLock(
        base({
          actor: actor('SUPER_ADMIN'),
          role: role('ADMIN'),
          code: 'MANAGE_PERMISSIONS',
          granted: true,
          manageHolderCount: 1,
        }),
      ),
    ).toBe('lastKey')
  })

  it('thứ tự R3 trước R1: MANAGER sửa MANAGE_PERMISSIONS của ADMIN → protected, không phải rank', () => {
    expect(cellLock(base({ role: role('ADMIN'), code: 'MANAGE_PERMISSIONS' }))).toBe('protected')
  })

  it('vai trò người dùng lạ → coi như cấp thấp nhất, không sửa được gì', () => {
    expect(cellLock(base({ actor: actor('CUSTOMER', ['IMPORT_FORM_CREATE']) }))).toBe('rank')
  })

  it('vai trò đích lạ → khoá (fail-closed)', () => {
    expect(
      cellLock(base({ actor: actor('ADMIN', ['IMPORT_FORM_CREATE']), role: role('UNKNOWN') })),
    ).toBe('rank')
  })

  it('chưa đăng nhập → khoá', () => {
    expect(cellLock(base({ actor: null }))).toBe('rank')
  })
})
