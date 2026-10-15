import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { materialAddAbilities } from './abilities'

describe('materialAddAbilities', () => {
  const u = (scope: string[], roleName = 'CUSTOM'): CurrentUser => ({
    userName: 'u',
    roleName,
    scope,
  })
  it('mặc định MANAGER (chỉ đọc) → tìm được, không gắn / tạo / NCC', () => {
    expect(
      materialAddAbilities(u(['MATERIAL_READ', 'UNIT_READ', 'WAREHOUSE_READ', 'SUPPLIER_READ'])),
    ).toEqual({ search: true, assign: false, create: false, attachSupplier: false })
  })
  it('đủ quyền', () => {
    expect(
      materialAddAbilities(
        u([
          'MATERIAL_READ',
          'MATERIAL_CREATE',
          'MATERIAL_UPDATE',
          'WAREHOUSE_UPDATE',
          'UNIT_READ',
          'SUPPLIER_READ',
          'SUPPLIER_UPDATE',
        ]),
      ),
    ).toEqual({ search: true, assign: true, create: true, attachSupplier: true })
  })
  it('thiếu UNIT_READ → gắn được, không tạo', () => {
    expect(
      materialAddAbilities(
        u(['MATERIAL_READ', 'MATERIAL_CREATE', 'MATERIAL_UPDATE', 'WAREHOUSE_UPDATE']),
      ),
    ).toMatchObject({ assign: true, create: false })
  })
  it('không MATERIAL_READ → không điểm vào', () => {
    expect(materialAddAbilities(u([])).search).toBe(false)
  })
  it('SUPER_ADMIN qua hết', () => {
    expect(materialAddAbilities(u([], 'SUPER_ADMIN'))).toEqual({
      search: true,
      assign: true,
      create: true,
      attachSupplier: true,
    })
  })
})
