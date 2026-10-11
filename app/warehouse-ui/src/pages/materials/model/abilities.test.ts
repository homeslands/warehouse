import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { materialAbilities } from './abilities'

const user = (scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'CUSTOM', scope })

describe('materialAbilities', () => {
  it('đủ quyền', () => {
    expect(
      materialAbilities(
        user([
          'MATERIAL_READ',
          'MATERIAL_CREATE',
          'MATERIAL_UPDATE',
          'MATERIAL_DELETE',
          'UNIT_READ',
          'UNIT_UPDATE',
        ]),
      ),
    ).toEqual({
      create: true,
      update: true,
      delete: true,
      viewConversions: true,
      manageConversions: true,
    })
  })

  it('thiếu UNIT_READ: không Thêm / Sửa (form tải GET /units), không thấy bảng quy đổi; Xoá vẫn được', () => {
    expect(
      materialAbilities(
        user(['MATERIAL_READ', 'MATERIAL_CREATE', 'MATERIAL_UPDATE', 'MATERIAL_DELETE']),
      ),
    ).toEqual({
      create: false,
      update: false,
      delete: true,
      viewConversions: false,
      manageConversions: false,
    })
  })

  it('thiếu UNIT_UPDATE: xem được bảng quy đổi nhưng không gắn / gỡ', () => {
    expect(
      materialAbilities(user(['MATERIAL_READ', 'MATERIAL_UPDATE', 'UNIT_READ'])),
    ).toMatchObject({
      update: true,
      viewConversions: true,
      manageConversions: false,
    })
  })
})
