import { AppearanceSheet } from '@/features/appearance-switch'
import { useCloseSheet } from '@/shared/lib/useCloseSheet'

/** Route `/appearance`: sheet chọn giao diện Theo hệ thống / Sáng / Tối — mở từ Tài khoản → Cài đặt. */
export function AppearanceScreen() {
  const close = useCloseSheet()
  return <AppearanceSheet onClose={close} />
}
