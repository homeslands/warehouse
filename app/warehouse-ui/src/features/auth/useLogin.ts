import { useMutation } from '@tanstack/react-query'
import { postData } from '@/shared/api/http'
import type { ApiError } from '@/shared/api/types'
import { useAuthStore } from '@/shared/auth/auth.store'
import type { LoginInput } from './login.schema'

export type LoginResult = {
  accessToken: string
  expireTime: string
}

export function useLogin() {
  const setToken = useAuthStore((s) => s.setToken)

  return useMutation<LoginResult, ApiError, LoginInput>({
    mutationFn: (input) => postData<LoginResult>('/auth/login', input),
    onSuccess: (result) => {
      // Backend cũng trả refreshToken + expireTimeRefreshToken. Ta cố ý KHÔNG lưu:
      // không endpoint nào tiêu thụ chúng, nên cất chỉ tạo rủi ro mà không đổi lấy gì.
      setToken(result.accessToken)
    },
  })
}
