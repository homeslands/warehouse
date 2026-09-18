import { useMutation } from '@tanstack/react-query'
import { postData } from '@/shared/api/http'
import { LOGIN_PATH } from '@/shared/api/routes'
import type { ApiError, AuthTokens } from '@/shared/api/types'
import { useAuthStore } from '@/entities/session'
import type { LoginInput } from '../model/login.schema'

export function useLogin() {
  const startSession = useAuthStore((s) => s.startSession)

  return useMutation<AuthTokens, ApiError, LoginInput>({
    mutationFn: (input) => postData<AuthTokens>(LOGIN_PATH, input),
    onSuccess: ({ accessToken, refreshToken }) => startSession({ accessToken, refreshToken }),
    // LoginPage hiện lỗi tại chỗ; toast global thêm là báo cùng một lỗi 2 lần.
    meta: { suppressErrorToast: true },
  })
}
