import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { deleteData, putData } from '@/shared/api/http'
import { refreshCurrentUser, useAuthStore } from '@/entities/session'
import { roleKeys } from '@/entities/user'

export type TogglePermissionInput = {
  roleSlug: string
  /** `Role.name` (vd `'MANAGER'`) — để biết có phải role của chính người đang đăng nhập không. */
  roleName: string
  authorityCode: string
  /** Trạng thái MONG MUỐN sau khi bấm: `true` → `PUT` (bật), `false` → `DELETE` (tắt). */
  granted: boolean
}

/**
 * Bật/tắt một ô role × authority. Cả `PUT` lẫn `DELETE` đều idempotent ở backend.
 *
 * Đặt ở `features/` chứ không phải `entities/authority`: nó invalidate `roleKeys` thuộc
 * `entities/user`, mà entity không được import entity ngang hàng (FSD). Cùng lý do với
 * `features/store-assign-warehouse`.
 *
 * Toast **thành công** nằm ở đây theo quy ước chung của repo; toast **lỗi** thì không — chốt
 * `MutationCache.onError` của `app/query-client.ts` lo (xem mục "Lỗi" trong CLAUDE.md).
 */
export function useTogglePermission() {
  const qc = useQueryClient()
  const { t } = useTranslation(['permissions'])
  const currentRoleName = useAuthStore((s) => s.user?.roleName)

  return useMutation({
    mutationFn: async ({ roleSlug, authorityCode, granted }: TogglePermissionInput) => {
      const path = `/roles/${roleSlug}/authorities/${authorityCode}`
      if (granted) await putData<string>(path)
      else await deleteData<string>(path)
    },
    onSuccess: async (_data, variables) => {
      toast.success(variables.granted ? t('permissions:granted') : t('permissions:revoked'))
      await qc.invalidateQueries({ queryKey: roleKeys.all })
      // Tự đổi quyền của role mình: backend đã đổi thật và đã xoá cache Redis, nhưng `scope` trong
      // store thì nạp một lần lúc mở phiên. Không nạp lại thì mọi `can()` sau đó trả lời sai.
      if (variables.roleName === currentRoleName) await refreshCurrentUser()
    },
  })
}
