import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/entities/session'
import { unitAbilities } from './abilities'

const user = (scope: string[]): CurrentUser => ({ userName: 'u', roleName: 'CUSTOM', scope })

describe('unitAbilities', () => {
  it('mỗi nút một mã', () => {
    expect(unitAbilities(user(['UNIT_READ']))).toEqual({
      create: false,
      update: false,
      delete: false,
    })
    expect(unitAbilities(user(['UNIT_READ', 'UNIT_CREATE', 'UNIT_UPDATE', 'UNIT_DELETE']))).toEqual(
      { create: true, update: true, delete: true },
    )
  })
})
