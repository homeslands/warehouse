import { can, type CurrentUser } from '@/entities/session'
import type { MaterialAbilities } from './types'

export function materialAbilities(user: CurrentUser | null): MaterialAbilities {
  const unitRead = can(user, 'UNIT_READ')
  return {
    read: can(user, 'MATERIAL_READ'),
    create: can(user, 'MATERIAL_CREATE') && unitRead,
    update: can(user, 'MATERIAL_UPDATE') && unitRead,
    delete: can(user, 'MATERIAL_DELETE'),
    manageConversions: can(user, 'MATERIAL_UPDATE') && can(user, 'UNIT_UPDATE') && unitRead,
  }
}
