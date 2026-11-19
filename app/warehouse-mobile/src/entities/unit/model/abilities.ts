import { can, type CurrentUser } from '@/entities/session'
import type { CatalogAbilities } from '@/shared/lib/catalog'

export function unitAbilities(user: CurrentUser | null): CatalogAbilities {
  return {
    read: can(user, 'UNIT_READ'),
    create: can(user, 'UNIT_CREATE'),
    update: can(user, 'UNIT_UPDATE'),
    delete: can(user, 'UNIT_DELETE'),
  }
}
