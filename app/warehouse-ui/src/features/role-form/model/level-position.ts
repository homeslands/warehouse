import type { TFunction } from 'i18next'
import type { Role } from '@/entities/user'

type Leveled = Role & { level: number }

/** Vị trí của một cấp mới so với các vai trò đang có — cho hộp xác nhận ("trên Giám sát, dưới Quản lý"). */
export function describeLevelPosition(
  level: number,
  roles: readonly Role[],
  label: (name: string) => string,
  t: TFunction<readonly ['roles', 'common']>,
): string {
  const leveled = roles.filter((role): role is Leveled => role.level !== undefined)
  const same = leveled.filter((role) => role.level === level)
  if (same.length > 0) {
    return t('roles:positionSame', { same: same.map((role) => label(role.name)).join(', ') })
  }
  const below = leveled.filter((role) => role.level < level).sort((a, b) => b.level - a.level)[0]
  const above = leveled.filter((role) => role.level > level).sort((a, b) => a.level - b.level)[0]
  if (below && above) {
    return t('roles:positionBetween', { below: label(below.name), above: label(above.name) })
  }
  if (above) return t('roles:positionLowest', { above: label(above.name) })
  if (below) return t('roles:positionHighest', { below: label(below.name) })
  return t('roles:positionOnly', {})
}
