import { useMutation } from '@tanstack/react-query'
import { postData } from '@/shared/api/http'
import { LOGOUT_ALL_PATH } from '@/shared/api/routes'
import type { ApiError } from '@/shared/api/types'
import { useAuthStore } from '@/entities/session'

/** Thu hồi mọi phiên, kể cả phiên hiện tại. Lỗi → toast global, phiên ở client giữ nguyên. */
export function useLogoutAll() {
  const endSession = useAuthStore((s) => s.endSession)

  return useMutation<{ revokedSessions: number }, ApiError, void>({
    mutationFn: () => postData<{ revokedSessions: number }>(LOGOUT_ALL_PATH),
    onSuccess: () => endSession('loggedOut'),
  })
}
