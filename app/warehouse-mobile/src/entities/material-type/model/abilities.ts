import { can, type CurrentUser } from '@/entities/session'
import type { CatalogAbilities } from '@/shared/lib/catalog'

export function materialTypeAbilities(user: CurrentUser | null): CatalogAbilities {
  return {
    read: can(user, 'MATERIAL_READ'),
    create: can(user, 'MATERIAL_CREATE'),
    update: can(user, 'MATERIAL_UPDATE'),
    delete: can(user, 'MATERIAL_DELETE'),
  }
}
