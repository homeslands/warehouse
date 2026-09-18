import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { postData } from '@/shared/api/http'
import { CHANGE_PASSWORD_PATH } from '@/shared/api/routes'
import type { ApiError, AuthTokens } from '@/shared/api/types'
import { useAuthStore } from '@/entities/session'

type ChangePasswordRequest = { currentPassword: string; newPassword: string }
type ChangePasswordResult = { tokens: AuthTokens }

export function useChangePassword() {
  const replaceTokens = useAuthStore((s) => s.replaceTokens)
  const { t } = useTranslation(['auth'])

  return useMutation<ChangePasswordResult, ApiError, ChangePasswordRequest>({
    mutationFn: (body) => postData<ChangePasswordResult>(CHANGE_PASSWORD_PATH, body),
    // Dialog tự báo lỗi: sai mật khẩu hiện tại hiện tại ô, lỗi khác tự toast.
    meta: { suppressErrorToast: true },
    onSuccess: ({ tokens }) => {
      // Backend đã thu hồi mọi phiên cũ; cặp token này là phiên mới của chính tab này.
      // Không xoá cache, không đổi user: người dùng vẫn là người đó.
      replaceTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
      toast.success(t('auth:changePassword.success'))
    },
  })
}
