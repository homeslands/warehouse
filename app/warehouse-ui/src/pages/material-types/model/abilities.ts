import { can, type CurrentUser } from '@/entities/session'

export type MaterialTypeAbilities = { create: boolean; update: boolean; delete: boolean }

/** Loại vật tư không có mã riêng: backend gác bằng `MATERIAL_*` (xem `material-type.controller.ts`). */
export function materialTypeAbilities(user: CurrentUser | null): MaterialTypeAbilities {
  return {
    create: can(user, 'MATERIAL_CREATE'),
    update: can(user, 'MATERIAL_UPDATE'),
    delete: can(user, 'MATERIAL_DELETE'),
  }
}
