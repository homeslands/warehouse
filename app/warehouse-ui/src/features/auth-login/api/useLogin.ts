import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { postData } from '@/shared/api/http'
import { LOGIN_PATH } from '@/shared/api/routes'
import type { ApiError, AuthTokens } from '@/shared/api/types'
import { useAuthStore } from '@/entities/session'
import type { LoginInput } from '../model/login.schema'

export function useLogin() {
  const startSession = useAuthStore((s) => s.startSession)
  const { t } = useTranslation(['auth'])

  return useMutation<AuthTokens, ApiError, LoginInput>({
    mutationFn: (input) => postData<AuthTokens>(LOGIN_PATH, input),
    onSuccess: ({ accessToken, refreshToken }) => {
      startSession({ accessToken, refreshToken })
      // Toaster nằm ở gốc app nên toast sống qua lần chuyển trang sang màn đích ngay sau đó.
      toast.success(t('auth:loginSuccess'))
    },
    // LoginPage hiện lỗi tại chỗ; toast global thêm là báo cùng một lỗi 2 lần.
    meta: { suppressErrorToast: true },
  })
}
