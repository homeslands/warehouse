import { useTranslation } from 'react-i18next'

import { Button, type ButtonVariant } from '@/shared/ui'

import { useLogoutAction } from './useLogoutAction'

/** Nút "Đăng xuất" thiết bị này (hỏi lại trước). Màn Tài khoản dùng thẳng `useLogoutAction`. */
export function LogoutButton({ variant = 'outline' }: { variant?: ButtonVariant }) {
  const { t } = useTranslation(['account'])
  const { request, pending } = useLogoutAction('this-device')
  return (
    <Button variant={variant} loading={pending} onPress={() => void request()}>
      {t('account:logout')}
    </Button>
  )
}
