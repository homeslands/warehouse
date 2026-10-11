import { describe, expect, it } from 'vitest'
import type { Role } from '@/entities/user'
import { describeLevelPosition } from './level-position'

const roles: Role[] = [
  { slug: 's', name: 'SUPERVISOR', level: 10, authorityCodes: [] },
  { slug: 'm', name: 'MANAGER', level: 20, authorityCodes: [] },
  { slug: 'x', name: 'Không cấp', authorityCodes: [] },
  { slug: 'a', name: 'ADMIN', level: 30, authorityCodes: [] },
]
const labels: Record<string, string> = {
  SUPERVISOR: 'Giám sát',
  MANAGER: 'Quản lý',
  ADMIN: 'Quản trị viên',
}
const label = (n: string) => labels[n] ?? n
const t = ((key: string, values?: Record<string, string>) =>
  `${key}|${Object.values(values ?? {}).join(',')}`) as never

describe('describeLevelPosition', () => {
  it('giữa hai vai trò gần nhất; bỏ qua vai trò không có cấp', () => {
    expect(describeLevelPosition(15, roles, label, t)).toBe(
      'roles:positionBetween|Giám sát,Quản lý',
    )
    expect(describeLevelPosition(25, roles, label, t)).toBe(
      'roles:positionBetween|Quản lý,Quản trị viên',
    )
  })
  it('thấp nhất, cao nhất, cùng cấp, duy nhất', () => {
    expect(describeLevelPosition(5, roles, label, t)).toBe('roles:positionLowest|Giám sát')
    expect(describeLevelPosition(40, roles, label, t)).toBe('roles:positionHighest|Quản trị viên')
    expect(describeLevelPosition(20, roles, label, t)).toBe('roles:positionSame|Quản lý')
    expect(describeLevelPosition(5, [], label, t)).toBe('roles:positionOnly|')
  })
})
