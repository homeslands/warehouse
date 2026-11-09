import { ChangePasswordSheet } from '@/features/change-password'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'

/** Route `/change-password`: sheet đổi mật khẩu, trình bày như `/switch-warehouse`. */
export function ChangePasswordScreen() {
  const close = useCloseSheet()
  return <ChangePasswordSheet onClose={close} />
}
