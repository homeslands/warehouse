import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import { useAuthStore } from '@/entities/session'
import { errorMessage } from '@/shared/api/error-message'
import { confirmAction } from '@/shared/lib/native-confirm'
import { useGuardedAction } from '@/shared/lib/useGuardedAction'

export type LogoutKind = 'this-device' | 'all-devices'

export type LogoutAction = {
  /** Hỏi lại bằng hộp thoại gốc; đồng ý thì gọi API. Đang chạy → bỏ qua. */
  request: () => Promise<void>
  pending: boolean
}

/**
 * Logic đăng xuất dùng chung cho nút (`LogoutButton`) và dòng danh sách (màn Tài khoản).
 * - `this-device`: `logout()` không ném — server lỗi/chậm vẫn đăng xuất ở client.
 * - `all-devices`: server lỗi → hộp thoại báo lỗi, phiên còn nguyên.
 * Luôn hỏi lại bằng `confirmAction` (hộp thoại gốc) rồi chạy qua `useGuardedAction`.
 */
export function useLogoutAction(kind: LogoutKind): LogoutAction {
  const { t } = useTranslation(['account', 'auth', 'common', 'errors'])
  const all = kind === 'all-devices'
  const action = useGuardedAction(
    () => (all ? useAuthStore.getState().logoutAll() : useAuthStore.getState().logout()),
    { onError: (e) => Alert.alert(t('auth:logoutAll.title'), errorMessage(e, t)) },
  )

  const request = async () => {
    if (action.pending) return
    const confirmed = await confirmAction({
      title: all ? t('auth:logoutAll.title') : t('account:logoutTitle'),
      message: all ? t('auth:logoutAll.confirm') : t('account:logoutConfirm'),
      confirmLabel: all ? t('auth:logoutAll.submit') : t('common:logout'),
      cancelLabel: t('common:cancel'),
      destructive: true,
    })
    if (confirmed) await action.run()
  }

  return { request, pending: action.pending }
}
