import { can, type CurrentUser } from '@/entities/session'

export type UnitAbilities = { create: boolean; update: boolean; delete: boolean }

/** Backend đơn vị gác `@RequireAuthority(UNIT_*)` từ đầu — mỗi nút một mã, không có nhánh lùi theo vai trò. */
export function unitAbilities(user: CurrentUser | null): UnitAbilities {
  return {
    create: can(user, 'UNIT_CREATE'),
    update: can(user, 'UNIT_UPDATE'),
    delete: can(user, 'UNIT_DELETE'),
  }
}
