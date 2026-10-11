import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { materialTypeAbilities } from './abilities'

const user = (scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'CUSTOM', scope })

describe('materialTypeAbilities', () => {
  it('dùng mã MATERIAL_* (loại vật tư không có mã riêng)', () => {
    expect(materialTypeAbilities(user(['MATERIAL_READ']))).toEqual({
      create: false,
      update: false,
      delete: false,
    })
    expect(
      materialTypeAbilities(
        user(['MATERIAL_READ', 'MATERIAL_CREATE', 'MATERIAL_UPDATE', 'MATERIAL_DELETE']),
      ),
    ).toEqual({ create: true, update: true, delete: true })
  })
})
