import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { warehouseAbilities } from './abilities'

const user = (roleName: string, scope: string[] = []): CurrentUser => ({
  userId: 'u1',
  userName: 't',
  roleName,
  scope,
})

const NONE = {
  create: false,
  update: false,
  assignManager: false,
  delete: false,
  filterByManager: false,
}
const ALL = { create: true, update: true, assignManager: true, delete: true, filterByManager: true }

describe('warehouseAbilities — cờ TẮT (backend còn @HasRole)', () => {
  const flags = { authorityGuards: false }

  it('ADMIN làm được mọi thứ, scope không ảnh hưởng', () => {
    expect(warehouseAbilities(user('ADMIN'), flags)).toEqual(ALL)
  })

  it('MANAGER có đủ mã trong scope vẫn KHÔNG làm được gì — backend còn hỏi vai trò', () => {
    const scope = ['WAREHOUSE_CREATE', 'WAREHOUSE_UPDATE', 'WAREHOUSE_DELETE', 'USER_READ']
    expect(warehouseAbilities(user('MANAGER', scope), flags)).toEqual(NONE)
  })
})

describe('warehouseAbilities — cờ BẬT (backend gác bằng @RequireAuthority)', () => {
  const flags = { authorityGuards: true }

  it('ADMIN nhưng scope rỗng → không làm được gì (vai trò không cấp quyền)', () => {
    expect(warehouseAbilities(user('ADMIN'), flags)).toEqual(NONE)
  })

  it('mỗi thao tác hỏi đúng một mã', () => {
    expect(warehouseAbilities(user('MANAGER', ['WAREHOUSE_CREATE']), flags)).toEqual({
      ...NONE,
      create: true,
    })
    expect(warehouseAbilities(user('MANAGER', ['WAREHOUSE_UPDATE']), flags).update).toBe(true)
    expect(warehouseAbilities(user('MANAGER', ['WAREHOUSE_DELETE']), flags).delete).toBe(true)
  })

  it('gán quản lý cần WAREHOUSE_ASSIGN_MANAGER + USER_READ + ROLE_READ — hộp gán tải GET /roles rồi GET /users', () => {
    const assign = (scope: string[]) =>
      warehouseAbilities(user('MANAGER', scope), flags).assignManager
    expect(assign(['WAREHOUSE_ASSIGN_MANAGER'])).toBe(false)
    expect(assign(['WAREHOUSE_ASSIGN_MANAGER', 'USER_READ'])).toBe(false)
    expect(assign(['WAREHOUSE_ASSIGN_MANAGER', 'ROLE_READ'])).toBe(false)
    expect(assign(['WAREHOUSE_ASSIGN_MANAGER', 'USER_READ', 'ROLE_READ'])).toBe(true)
  })

  it('lọc theo quản lý cần USER_READ + ROLE_READ (ô lọc gọi GET /roles và GET /users)', () => {
    const filter = (scope: string[]) =>
      warehouseAbilities(user('SUPERVISOR', scope), flags).filterByManager
    expect(filter(['USER_READ'])).toBe(false)
    expect(filter(['USER_READ', 'ROLE_READ'])).toBe(true)
  })

  it('SUPER_ADMIN làm được mọi thứ dù scope rỗng', () => {
    expect(warehouseAbilities(user('SUPER_ADMIN'), flags)).toEqual(ALL)
  })
})
