import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { fetchAuthSessions, fetchProfile, revokeAuthSession, updateProfile } from './session.api'
import { sessionKeys } from './query-keys'

/**
 * Hồ sơ của chính mình. Khác `useAuthStore` (đọc từ token, có ngay lúc mount): hook này gọi
 * `GET /auth/me` để lấy bản mới nhất từ server — token chỉ mang thông tin lúc đăng nhập.
 */
export function useProfile() {
  return useQuery({ queryKey: sessionKeys.profile(), queryFn: fetchProfile })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  const { t } = useTranslation('account')

  return useMutation({
    mutationFn: updateProfile,
    // Form tự báo lỗi tại ô (email trùng), nên tắt toast lỗi chung.
    meta: { suppressErrorToast: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sessionKeys.all })
      toast.success(t('profileSaved'))
    },
  })
}

/**
 * Danh sách thiết bị đang đăng nhập.
 *
 * `enabled` do BÊN GỌI truyền vào, không đọc cờ `BACKEND_SUPPORTS` ở đây: entity không nên biết
 * gì về việc backend đã làm tới đâu — đó là chuyện của tầng màn hình. Backend chưa có endpoint
 * này nên trang phải truyền `BACKEND_SUPPORTS.sessionList`.
 */
export function useAuthSessions(enabled: boolean) {
  return useQuery({
    queryKey: sessionKeys.devices(),
    queryFn: fetchAuthSessions,
    enabled,
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  const { t } = useTranslation('account')

  return useMutation({
    mutationFn: revokeAuthSession,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sessionKeys.devices() })
      toast.success(t('deviceRevoked'))
    },
  })
}
