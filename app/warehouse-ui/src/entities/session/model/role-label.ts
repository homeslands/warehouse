import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ROLES, type Role } from './roles'

const KNOWN = new Set<string>(Object.values(ROLES))

function isRole(name: string): name is Role {
  return KNOWN.has(name)
}

/**
 * Tên vai trò để hiển thị (`MANAGER` → "Quản lý" / "Manager"). Mã vai trò lạ (backend thêm vai trò
 * mới mà FE chưa biết) → hiện nguyên mã, không để trống.
 */
export function useRoleLabel(): (roleName: string | undefined) => string {
  const { t } = useTranslation(['common'])
  return useCallback(
    (roleName) => {
      if (!roleName) return ''
      return isRole(roleName) ? t(`common:roles.${roleName}`) : roleName
    },
    [t],
  )
}
