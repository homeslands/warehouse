import { can, type CurrentUser } from '@/entities/session'

export type MaterialAbilities = {
  /** `POST /materials` = MATERIAL_CREATE; form tải `GET /units` (UNIT_READ) cho ô Đơn vị gốc. */
  create: boolean
  /** `PATCH /materials/:slug` = MATERIAL_UPDATE; + UNIT_READ như trên. */
  update: boolean
  delete: boolean
  /** `GET .../conversion-units` = MATERIAL_READ + UNIT_READ (MATERIAL_READ đã có nhờ route guard). */
  viewConversions: boolean
  /** Gắn / sửa tỉ lệ / gỡ = MATERIAL_UPDATE + UNIT_UPDATE; hộp gắn tải `.../available` (UNIT_READ). */
  manageConversions: boolean
}

/** Backend vật tư gác `@RequireAuthority` từ đầu — không có nhánh lùi theo vai trò. */
export function materialAbilities(user: CurrentUser | null): MaterialAbilities {
  const unitRead = can(user, 'UNIT_READ')
  return {
    create: can(user, 'MATERIAL_CREATE') && unitRead,
    update: can(user, 'MATERIAL_UPDATE') && unitRead,
    delete: can(user, 'MATERIAL_DELETE'),
    viewConversions: unitRead,
    manageConversions: unitRead && can(user, 'MATERIAL_UPDATE') && can(user, 'UNIT_UPDATE'),
  }
}
